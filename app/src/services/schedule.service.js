/**
 * Ports gsShiftTaskWithDomino and gsAnalyzeDeletion/gsExecuteDeletion; sheet cells are
 * normalized rows here, and cycle ownership is inferred because ScheduleEntry has no cycleId.
 */

import { ApiError } from "../middleware/errorHandler.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDate(value, fieldName = "date") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, `${fieldName} must use YYYY-MM-DD format`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, `${fieldName} is not a valid date`);
  }
  return date;
}

function dateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function entityWhere(entry) {
  return {
    unitId: entry.unitId,
    commonAreaId: entry.commonAreaId,
    facadeId: entry.facadeId,
  };
}

function sequenceSteps(sequence) {
  if (!Array.isArray(sequence)) return [];
  return sequence
    .filter((step) => step && typeof step === "object" && (step.taskTypeId || step.taskAbbr))
    .map((step, index) => ({ ...step, id: step.id || `step_${index}` }));
}

function stepMatchesTask(step, taskType) {
  return step.taskTypeId === taskType.id
    || String(step.taskAbbr || "").split("@")[0].trim().toUpperCase() === taskType.abbreviation.toUpperCase();
}

function descendantSteps(steps, source) {
  const descendants = new Set([source.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of steps) {
      if (step.id && step.dependsOn && descendants.has(step.dependsOn) && !descendants.has(step.id)) {
        descendants.add(step.id);
        changed = true;
      }
    }
  }
  return steps.filter((step) => descendants.has(step.id));
}

function makeWorkingDayChecker(exceptions) {
  const overrides = new Map(exceptions.map((item) => [dateKey(item.date), item.isWorkingDay]));
  return (date) => {
    const override = overrides.get(dateKey(date));
    if (override !== undefined) return override;
    const day = date.getUTCDay();
    return day !== 0 && day !== 6;
  };
}

function addWorkingDays(date, amount, isWorkingDay) {
  const result = new Date(date);
  if (amount === 0) {
    while (!isWorkingDay(result)) result.setUTCDate(result.getUTCDate() + 1);
    return result;
  }
  const direction = Math.sign(amount);
  let remaining = Math.abs(amount);
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + direction);
    if (isWorkingDay(result)) remaining -= 1;
  }
  return result;
}

function workingDayDelta(from, to, isWorkingDay) {
  if (from.getTime() === to.getTime()) return 0;
  const direction = from < to ? 1 : -1;
  let result = 0;
  const cursor = new Date(from);
  while (cursor.getTime() !== to.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + direction);
    if (isWorkingDay(cursor)) result += direction;
  }
  return result;
}

export async function shiftTaskWithDomino(prisma, { scheduleEntryId, newDate }) {
  if (!scheduleEntryId) throw new ApiError(400, "scheduleEntryId is required");
  const requestedDate = parseIsoDate(newDate, "newDate");
  const entry = await prisma.scheduleEntry.findUnique({
    where: { id: scheduleEntryId },
    include: { taskType: true },
  });
  if (!entry) throw new ApiError(404, "Schedule entry not found");

  const cycles = await prisma.taskCycle.findMany({ where: { projectId: entry.taskType.projectId } });
  const matches = cycles.map((cycle) => {
    const steps = sequenceSteps(cycle.sequence);
    return { cycle, steps, source: steps.find((step) => stepMatchesTask(step, entry.taskType)) };
  }).filter((match) => match.source);
  if (matches.length > 1) {
    throw new ApiError(409, "Task belongs to multiple task cycles; cycle ownership is ambiguous");
  }

  const exceptions = await prisma.calendarException.findMany({
    where: { projectId: entry.taskType.projectId },
  });
  const isWorkingDay = makeWorkingDayChecker(exceptions);
  const oldDate = new Date(entry.scheduledDate);
  const direction = requestedDate < oldDate ? -1 : 1;
  let effectiveDate = new Date(requestedDate);
  while (!isWorkingDay(effectiveDate)) effectiveDate.setUTCDate(effectiveDate.getUTCDate() + direction);
  const delta = workingDayDelta(oldDate, effectiveDate, isWorkingDay);

  let affectedTaskTypes = [entry.taskType];
  let cycle = null;
  if (matches.length === 1) {
    cycle = matches[0].cycle;
    const dependentSteps = descendantSteps(matches[0].steps, matches[0].source);
    const ids = dependentSteps.map((step) => step.taskTypeId).filter(Boolean);
    const abbreviations = dependentSteps.map((step) => String(step.taskAbbr || "").split("@")[0].trim()).filter(Boolean);
    affectedTaskTypes = await prisma.taskType.findMany({
      where: { projectId: entry.taskType.projectId, OR: [{ id: { in: ids } }, { abbreviation: { in: abbreviations } }] },
    });
  }
  const affectedIds = affectedTaskTypes.map((taskType) => taskType.id);
  const related = await prisma.scheduleEntry.findMany({
    where: { ...entityWhere(entry), taskTypeId: { in: affectedIds } },
    include: { taskType: { select: { abbreviation: true } } },
    orderBy: [{ scheduledDate: "asc" }, { id: "asc" }],
  });
  const entriesToMove = related.filter((item) => item.id === entry.id || item.taskTypeId !== entry.taskTypeId);
  const changes = entriesToMove.map((item) => ({
    id: item.id,
    taskTypeId: item.taskTypeId,
    taskAbbreviation: item.taskType.abbreviation,
    oldDate: dateKey(item.scheduledDate),
    newDate: dateKey(addWorkingDays(item.scheduledDate, delta, isWorkingDay)),
  }));

  if (changes.some((change) => change.oldDate !== change.newDate)) {
    await prisma.$transaction(async (tx) => {
      for (const change of changes) {
        await tx.scheduleEntry.update({ where: { id: change.id }, data: { scheduledDate: parseIsoDate(change.newDate) } });
      }
      // Recap/Avancement were spreadsheet grids; TaskProgress.targetDate is their relational analogue.
      for (const taskTypeId of new Set(changes.map((change) => change.taskTypeId))) {
        const dates = changes.filter((change) => change.taskTypeId === taskTypeId).map((change) => change.newDate).sort();
        await tx.taskProgress.updateMany({
          where: { ...entityWhere(entry), taskTypeId },
          data: { targetDate: parseIsoDate(dates[0]) },
        });
      }
    });
  }

  return {
    scheduleEntryId,
    cycle: cycle ? { id: cycle.id, name: cycle.name } : null,
    requestedDate: dateKey(requestedDate),
    effectiveDate: dateKey(effectiveDate),
    workingDaysDelta: delta,
    changes,
  };
}

export async function analyzeTaskTypeDeletion(prisma, { taskTypeId }) {
  if (!taskTypeId) throw new ApiError(400, "taskTypeId is required");
  const taskType = await prisma.taskType.findUnique({
    where: { id: taskTypeId },
    select: { id: true, projectId: true, abbreviation: true, description: true },
  });
  if (!taskType) throw new ApiError(404, "Task type not found");
  const [scheduleEntries, taskProgress] = await Promise.all([
    prisma.scheduleEntry.findMany({ where: { taskTypeId }, orderBy: [{ scheduledDate: "asc" }, { id: "asc" }] }),
    prisma.taskProgress.findMany({ where: { taskTypeId }, orderBy: { id: "asc" } }),
  ]);
  return {
    taskType,
    counts: { scheduleEntries: scheduleEntries.length, taskProgress: taskProgress.length },
    scheduleEntries,
    taskProgress,
  };
}

export async function executeTaskTypeDeletion(prisma, { taskTypeId }) {
  const impact = await analyzeTaskTypeDeletion(prisma, { taskTypeId });
  await prisma.$transaction(async (tx) => {
    await tx.scheduleEntry.deleteMany({ where: { taskTypeId } });
    await tx.taskProgress.deleteMany({ where: { taskTypeId } });
    await tx.taskType.delete({ where: { id: taskTypeId } });
  });
  // Discipline/Team rename cascades are obsolete: the new schema stores foreign-key IDs, not names.
  return { deletedTaskType: impact.taskType, deleted: impact.counts };
}
