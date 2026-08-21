import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../middleware/errorHandler.js";
import { requireAuth, requireCanEdit } from "../middleware/auth.js";
import {
  analyzeTaskTypeDeletion,
  executeTaskTypeDeletion,
  shiftTaskWithDomino,
} from "../services/schedule.service.js";

const router = Router();
router.use(requireAuth);

async function loadEntryProject(req, _res, next) {
  const entry = await prisma.scheduleEntry.findUnique({
    where: { id: req.body?.scheduleEntryId || "" },
    select: { taskType: { select: { project: true } } },
  });
  if (!entry) throw new ApiError(404, "Schedule entry not found");
  req.project = entry.taskType.project;
  next();
}

async function loadTaskTypeProject(req, _res, next) {
  const taskType = await prisma.taskType.findUnique({
    where: { id: req.params.id },
    select: { project: true },
  });
  if (!taskType) throw new ApiError(404, "Task type not found");
  req.project = taskType.project;
  next();
}

router.post("/shift-task", loadEntryProject, requireCanEdit, async (req, res) => {
  const { scheduleEntryId, newDate } = req.body || {};
  if (!newDate) throw new ApiError(400, "newDate is required");
  res.json(await shiftTaskWithDomino(prisma, { scheduleEntryId, newDate }));
});

router.get("/task-types/:id/deletion-impact", async (req, res) => {
  res.json(await analyzeTaskTypeDeletion(prisma, { taskTypeId: req.params.id }));
});

router.delete("/task-types/:id", loadTaskTypeProject, requireCanEdit, async (req, res) => {
  res.json(await executeTaskTypeDeletion(prisma, { taskTypeId: req.params.id }));
});

// ---- Disciplines ----

router.get("/disciplines", async (req, res) => {
  const { projectId } = req.query;
  res.json(await prisma.discipline.findMany({ where: projectId ? { projectId } : undefined, orderBy: { name: "asc" } }));
});

router.post("/disciplines", requireCanEdit, async (req, res) => {
  const { projectId, name } = req.body;
  res.status(201).json(await prisma.discipline.create({ data: { projectId, name } }));
});

router.put("/disciplines/:id", requireCanEdit, async (req, res) => {
  res.json(await prisma.discipline.update({ where: { id: req.params.id }, data: { name: req.body.name } }));
});

router.delete("/disciplines/:id", requireCanEdit, async (req, res) => {
  await prisma.discipline.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ---- Teams (Équipes) ----

router.get("/teams", async (req, res) => {
  const { projectId } = req.query;
  res.json(await prisma.team.findMany({ where: projectId ? { projectId } : undefined, orderBy: { name: "asc" } }));
});

router.post("/teams", requireCanEdit, async (req, res) => {
  const { projectId, name } = req.body;
  res.status(201).json(await prisma.team.create({ data: { projectId, name } }));
});

router.put("/teams/:id", requireCanEdit, async (req, res) => {
  res.json(await prisma.team.update({ where: { id: req.params.id }, data: { name: req.body.name } }));
});

router.delete("/teams/:id", requireCanEdit, async (req, res) => {
  await prisma.team.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ---- Task types (Tâches) ----

router.get("/task-types", async (req, res) => {
  const { projectId } = req.query;
  res.json(
    await prisma.taskType.findMany({
      where: projectId ? { projectId } : undefined,
      include: { team: true },
      orderBy: { abbreviation: "asc" },
    })
  );
});

router.post("/task-types", requireCanEdit, async (req, res) => {
  const { projectId, abbreviation, activityType, teamId, description, shortDescription, color, defaultDuration, durationType } = req.body;
  res.status(201).json(
    await prisma.taskType.create({
      data: { projectId, abbreviation, activityType, teamId, description, shortDescription, color, defaultDuration, durationType },
    })
  );
});

router.put("/task-types/:id", requireCanEdit, async (req, res) => {
  const { abbreviation, activityType, teamId, description, shortDescription, color, defaultDuration, durationType } = req.body;
  res.json(
    await prisma.taskType.update({
      where: { id: req.params.id },
      data: { abbreviation, activityType, teamId, description, shortDescription, color, defaultDuration, durationType },
    })
  );
});

// ---- Task cycles ----

router.get("/cycles", async (req, res) => {
  const { projectId } = req.query;
  res.json(await prisma.taskCycle.findMany({ where: projectId ? { projectId } : undefined, orderBy: { name: "asc" } }));
});

router.post("/cycles", requireCanEdit, async (req, res) => {
  const { projectId, name, description, sequence } = req.body;
  res.status(201).json(await prisma.taskCycle.create({ data: { projectId, name, description, sequence: sequence || [] } }));
});

router.put("/cycles/:id", requireCanEdit, async (req, res) => {
  const { name, description, sequence } = req.body;
  res.json(await prisma.taskCycle.update({ where: { id: req.params.id }, data: { name, description, sequence } }));
});

router.delete("/cycles/:id", requireCanEdit, async (req, res) => {
  await prisma.taskCycle.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ---- Schedule entries (read-only Gantt data for now — creation happens
// via project-generation in Settings, not directly here) ----

router.get("/entries", async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) throw new ApiError(400, "projectId is required");
  const entries = await prisma.scheduleEntry.findMany({
    where: { taskType: { projectId } },
    include: { taskType: true, unit: true, commonArea: true, facade: true },
    orderBy: { scheduledDate: "asc" },
  });
  res.json(entries);
});

export default router;
