import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const { projectId, status } = req.query;
  const reserves = await prisma.reserve.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(reserves);
});

router.get("/:id", async (req, res) => {
  const reserve = await prisma.reserve.findUnique({
    where: { id: req.params.id },
    include: { photos: true, assignee: true },
  });
  if (!reserve) throw new ApiError(404, "Reserve not found");
  res.json(reserve);
});

router.post("/", async (req, res) => {
  const { projectId, unitId, title, description, status, priority, assigneeId, dueDate } = req.body;
  const reserve = await prisma.reserve.create({
    data: { projectId, unitId, title, description, status: status || "open", priority, assigneeId, dueDate },
  });
  res.status(201).json(reserve);
});

router.put("/:id", async (req, res) => {
  const { title, description, status, priority, assigneeId, dueDate } = req.body;
  const reserve = await prisma.reserve.update({
    where: { id: req.params.id },
    data: { title, description, status, priority, assigneeId, dueDate },
  });
  res.json(reserve);
});

router.delete("/:id", async (req, res) => {
  await prisma.reserve.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
