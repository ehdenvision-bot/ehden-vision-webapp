import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../middleware/errorHandler.js";
import { requireAuth, requireCanEdit } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const { projectId } = req.query;
  const buildings = await prisma.building.findMany({
    where: projectId ? { projectId } : undefined,
    include: { units: true, commonAreas: true, facades: true },
    orderBy: { code: "asc" },
  });
  res.json(buildings);
});

router.get("/:id", async (req, res) => {
  const building = await prisma.building.findUnique({
    where: { id: req.params.id },
    include: { units: true, commonAreas: true, facades: true },
  });
  if (!building) throw new ApiError(404, "Building not found");
  res.json(building);
});

router.post("/", requireCanEdit, async (req, res) => {
  const { projectId, code } = req.body;
  const building = await prisma.building.create({ data: { projectId, code } });
  res.status(201).json(building);
});

// ---- Units ----

router.get("/:buildingId/units", async (req, res) => {
  const units = await prisma.unit.findMany({
    where: { buildingId: req.params.buildingId },
    include: { tenants: { where: { isCurrent: true } } },
  });
  res.json(units);
});

router.post("/:buildingId/units", requireCanEdit, async (req, res) => {
  const { identifiant, hall, floor, stackNumber, doorNumber, type, unitTypeConfig, surfaceM2 } = req.body;
  const unit = await prisma.unit.create({
    data: {
      buildingId: req.params.buildingId,
      identifiant,
      hall,
      floor,
      stackNumber,
      doorNumber,
      type,
      unitTypeConfig,
      surfaceM2,
    },
  });
  res.status(201).json(unit);
});

router.get("/units/:unitId", async (req, res) => {
  const unit = await prisma.unit.findUnique({
    where: { id: req.params.unitId },
    include: { tenants: true, reserves: true, edlNotes: true },
  });
  if (!unit) throw new ApiError(404, "Unit not found");
  res.json(unit);
});

export default router;
