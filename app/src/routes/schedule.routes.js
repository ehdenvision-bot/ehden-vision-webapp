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

export default router;
