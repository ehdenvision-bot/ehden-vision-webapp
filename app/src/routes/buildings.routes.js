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

// ---- Locataires page bootstrap: units + common areas + facades for a
// project in one call, matching the legacy getLocatairesPageData shape. ----

router.get("/locataires/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const [units, commonAreas, facades, facadeTypes] = await Promise.all([
    prisma.unit.findMany({
      where: { building: { projectId } },
      include: { tenants: { where: { isCurrent: true }, take: 1 }, building: true },
      orderBy: { identifiant: "asc" },
    }),
    prisma.commonArea.findMany({
      where: { building: { projectId } },
      include: { building: true },
      orderBy: { identifiant: "asc" },
    }),
    prisma.facade.findMany({
      where: { building: { projectId } },
      include: { building: true },
      orderBy: { identifiant: "asc" },
    }),
    prisma.facadeType.findMany(),
  ]);
  res.json({ units, commonAreas, facades, facadeTypes });
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

// Updates the tenant contact block + the shared "Suivi & Planning" block —
// mirrors the legacy updateLocataireData (contact fields) always paired
// with a planning-block write.
router.put("/units/:unitId/contact", requireCanEdit, async (req, res) => {
  const { lastName, firstName, email, email2, phoneFixed, phoneMobile1, phoneMobile2, planningStatus, notePublic, notePrivate } = req.body;
  const unit = await prisma.unit.findUnique({ where: { id: req.params.unitId }, include: { tenants: { where: { isCurrent: true }, take: 1 } } });
  if (!unit) throw new ApiError(404, "Unit not found");

  const existingTenant = unit.tenants[0];
  const tenantData = { lastName, firstName, email, email2, phoneFixed, phoneMobile1, phoneMobile2 };
  const [, updatedUnit] = await prisma.$transaction([
    existingTenant
      ? prisma.tenant.update({ where: { id: existingTenant.id }, data: tenantData })
      : prisma.tenant.create({ data: { unitId: unit.id, ...tenantData } }),
    prisma.unit.update({ where: { id: unit.id }, data: { planningStatus, notePublic, notePrivate } }),
  ]);
  res.json(updatedUnit);
});

// Planning-block-only write for common areas / facades (no contact fields)
// — mirrors the legacy updatePlanningOnlyData.
router.put("/common-areas/:id/planning", requireCanEdit, async (req, res) => {
  const { planningStatus, notePublic, notePrivate } = req.body;
  const commonArea = await prisma.commonArea.update({
    where: { id: req.params.id },
    data: { planningStatus, notePublic, notePrivate },
  });
  res.json(commonArea);
});

router.put("/facades/:id/planning", requireCanEdit, async (req, res) => {
  const { planningStatus, notePublic, notePrivate } = req.body;
  const facade = await prisma.facade.update({
    where: { id: req.params.id },
    data: { planningStatus, notePublic, notePrivate },
  });
  res.json(facade);
});

export default router;
