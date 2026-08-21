import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../middleware/errorHandler.js";
import { requireAuth, requireCanEdit } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";

const router = Router();
router.use(requireAuth);

// ---- EDL notes (per unit x room) ----

router.get("/notes/:unitId", async (req, res) => {
  const notes = await prisma.edlNote.findMany({ where: { unitId: req.params.unitId } });
  res.json(notes);
});

router.put("/notes/:unitId/:room", requireCanEdit, async (req, res) => {
  const { notePublic, notePrivate } = req.body;
  const note = await prisma.edlNote.upsert({
    where: { unitId_room: { unitId: req.params.unitId, room: req.params.room } },
    update: { notePublic, notePrivate },
    create: { unitId: req.params.unitId, room: req.params.room, notePublic, notePrivate },
  });
  res.json(note);
});

// ---- EDL photos ----

router.get("/photos/:unitId", async (req, res) => {
  const photos = await prisma.edlPhoto.findMany({ where: { unitId: req.params.unitId } });
  res.json(photos);
});

router.post("/photos/:unitId", requireCanEdit, upload.single("photo"), async (req, res) => {
  if (!req.file) throw new ApiError(400, "photo file is required");
  const photo = await prisma.edlPhoto.create({
    data: {
      unitId: req.params.unitId,
      room: req.body.room || null,
      filePath: `/uploads/${req.file.filename}`,
    },
  });
  res.status(201).json(photo);
});

router.delete("/photos/:id", requireCanEdit, async (req, res) => {
  await prisma.edlPhoto.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ---- Work field definitions + values ("Config Travaux" / "Données Travaux") ----

router.get("/work-fields", async (_req, res) => {
  const fields = await prisma.workFieldDefinition.findMany();
  res.json(fields);
});

router.post("/work-fields", requireCanEdit, async (req, res) => {
  const { code, targetEntityType, subCategory, discipline, workType, applicableRooms, fieldType, fieldDetails, options } = req.body;
  const field = await prisma.workFieldDefinition.create({
    data: { code, targetEntityType, subCategory, discipline, workType, applicableRooms, fieldType, fieldDetails, options },
  });
  res.status(201).json(field);
});

router.put("/work-fields/:id", requireCanEdit, async (req, res) => {
  const { targetEntityType, subCategory, discipline, workType, applicableRooms, fieldType, fieldDetails, options } = req.body;
  const field = await prisma.workFieldDefinition.update({
    where: { id: req.params.id },
    data: { targetEntityType, subCategory, discipline, workType, applicableRooms, fieldType, fieldDetails, options },
  });
  res.json(field);
});

router.delete("/work-fields/:id", requireCanEdit, async (req, res) => {
  await prisma.workFieldDefinition.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

router.get("/work-values/:unitId", async (req, res) => {
  const values = await prisma.workFieldValue.findMany({
    where: { unitId: req.params.unitId },
    include: { field: true },
  });
  res.json(values);
});

router.put("/work-values/:unitId/:fieldId", requireCanEdit, async (req, res) => {
  const { value } = req.body;
  const record = await prisma.workFieldValue.upsert({
    where: { unitId_fieldId: { unitId: req.params.unitId, fieldId: req.params.fieldId } },
    update: { value },
    create: { unitId: req.params.unitId, fieldId: req.params.fieldId, value },
  });
  res.json(record);
});

export default router;
