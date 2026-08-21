import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (_req, res) => {
  const projects = await prisma.project.findMany({ orderBy: { code: "asc" } });
  res.json(projects);
});

router.get("/:id", async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: { buildings: true },
  });
  if (!project) throw new ApiError(404, "Project not found");
  res.json(project);
});

router.post("/", async (req, res) => {
  const { code, name, address, status, startDate, endDate } = req.body;
  const project = await prisma.project.create({
    data: { code, name, address, status, startDate, endDate },
  });
  res.status(201).json(project);
});

router.put("/:id", async (req, res) => {
  const { name, address, status, startDate, endDate } = req.body;
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: { name, address, status, startDate, endDate },
  });
  res.json(project);
});

router.delete("/:id", async (req, res) => {
  await prisma.project.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
