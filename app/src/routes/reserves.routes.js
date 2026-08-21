import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../middleware/errorHandler.js";
import { requireAuth, requireCanEdit } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

function byProject(projectId) {
  if (!projectId) return {};
  return {
    OR: [
      { unit: { building: { projectId } } },
      { commonArea: { building: { projectId } } },
      { facade: { building: { projectId } } },
    ],
  };
}

function genCode(kind) {
  const prefix = kind === "autocontrole" ? "A" : "R";
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

router.get("/", async (req, res) => {
  const { projectId, status, kind } = req.query;
  const reserves = await prisma.reserve.findMany({
    where: {
      ...byProject(projectId),
      ...(status ? { status } : {}),
      ...(kind ? { kind } : {}),
    },
    include: { unit: true, commonArea: true, facade: true, discipline: true, team: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(reserves);
});

router.get("/:id", async (req, res) => {
  const reserve = await prisma.reserve.findUnique({
    where: { id: req.params.id },
    include: { unit: true, commonArea: true, facade: true, discipline: true, team: true, teamContact: true },
  });
  if (!reserve) throw new ApiError(404, "Reserve not found");
  res.json(reserve);
});

router.post("/", requireCanEdit, async (req, res) => {
  const {
    kind, unitId, commonAreaId, facadeId, disciplineId, description,
    coordX, coordY, status, teamId, interventionDate, interventionSlot, dueDate,
  } = req.body;
  const reserve = await prisma.reserve.create({
    data: {
      code: genCode(kind),
      kind: kind || "reserve",
      unitId, commonAreaId, facadeId, disciplineId, description,
      coordX, coordY, status: status || "open", teamId,
      interventionDate, interventionSlot, dueDate,
    },
  });
  res.status(201).json(reserve);
});

router.put("/:id", requireCanEdit, async (req, res) => {
  const { description, status, teamId, interventionDate, interventionSlot, dueDate, cleared, needsValidation } = req.body;
  const reserve = await prisma.reserve.update({
    where: { id: req.params.id },
    data: { description, status, teamId, interventionDate, interventionSlot, dueDate, cleared, needsValidation },
  });
  res.json(reserve);
});

router.delete("/:id", requireCanEdit, async (req, res) => {
  await prisma.reserve.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
