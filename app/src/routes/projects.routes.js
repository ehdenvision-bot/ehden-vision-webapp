import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../middleware/errorHandler.js";
import { requireAuth, requireCanEdit } from "../middleware/auth.js";

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

router.post("/", requireCanEdit, async (req, res) => {
  const { code, name, owner, status, startDate, endDate, city, country, units, description } = req.body;
  const project = await prisma.project.create({
    data: { code, name, owner, status, startDate, endDate, city, country, units, description },
  });
  res.status(201).json(project);
});

router.put("/:id", requireCanEdit, async (req, res) => {
  const { name, owner, status, startDate, endDate, city, country, units, description, progressPct } = req.body;
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: { name, owner, status, startDate, endDate, city, country, units, description, progressPct },
  });
  res.json(project);
});

router.delete("/:id", requireCanEdit, async (req, res) => {
  await prisma.project.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
