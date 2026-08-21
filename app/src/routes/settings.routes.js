import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../middleware/errorHandler.js";
import { requireAuth, requireCanEdit } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

function requireAdminOrDirecteur(req, _res, next) {
  if (!["Admin", "Directeur"].includes(req.user?.roleName)) throw new ApiError(403, "Admin/Directeur only");
  next();
}

// Gauss algorithm — ported from Settings_Code.js's calculateFrenchHolidays.
function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

// French public holidays (isFixed: real holidays, dates locked) + the
// company's "Jour du Patron" (auto-calculated but editable, Dec 24 rolled
// back to the nearest weekday) — matches Settings_Code.js exactly.
function calculateFrenchHolidays(year) {
  const easter = easterDate(year);
  const holidays = [
    { date: `${year}-01-01`, description: "Jour de l'an", isFixed: true },
    { date: iso(easter), description: "Pâques", isFixed: true },
    { date: iso(addDays(easter, 1)), description: "Lundi de Pâques", isFixed: true },
    { date: `${year}-05-01`, description: "Fête du Travail", isFixed: true },
    { date: `${year}-05-08`, description: "Armistice 39/45", isFixed: true },
    { date: iso(addDays(easter, 39)), description: "Ascension", isFixed: true },
    { date: iso(addDays(easter, 50)), description: "Lundi de Pentecôte", isFixed: true },
    { date: `${year}-07-14`, description: "Fête Nationale", isFixed: true },
    { date: `${year}-08-15`, description: "Assomption", isFixed: true },
    { date: `${year}-11-01`, description: "Toussaint", isFixed: true },
    { date: `${year}-11-11`, description: "Armistice 14/18", isFixed: true },
    { date: `${year}-12-25`, description: "Noël", isFixed: true },
  ];

  let patron = new Date(Date.UTC(year, 11, 24));
  const day = patron.getUTCDay();
  if (day === 0) patron = addDays(patron, -2); // Sunday -> Friday
  else if (day === 6) patron = addDays(patron, -1); // Saturday -> Friday
  holidays.push({ date: iso(patron), description: "Jour du Patron", isFixed: false });

  return holidays.map((h) => ({ ...h, isWorkingDay: false }));
}

router.get("/holidays/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const { year } = req.query;
  const y = Number(year) || new Date().getFullYear();

  const custom = await prisma.calendarException.findMany({
    where: { projectId, date: { gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) } },
    orderBy: { date: "asc" },
  });
  const customFixed = new Set(custom.filter((c) => c.isFixed).map((c) => `${iso(c.date)}|${c.description}`));

  const computed = calculateFrenchHolidays(y).filter((h) => !customFixed.has(`${h.date}|${h.description}`));

  res.json({
    fixed: computed,
    custom: custom.filter((c) => !c.isFixed).map((c) => ({ id: c.id, date: iso(c.date), description: c.description, isWorkingDay: c.isWorkingDay })),
    fixedOverrides: custom.filter((c) => c.isFixed).map((c) => ({ id: c.id, date: iso(c.date), description: c.description, isWorkingDay: c.isWorkingDay })),
  });
});

router.post("/holidays/:projectId", requireCanEdit, requireAdminOrDirecteur, async (req, res) => {
  const { projectId } = req.params;
  const { date, description } = req.body;
  const holiday = await prisma.calendarException.upsert({
    where: { projectId_date_description: { projectId, date: new Date(date), description } },
    update: {},
    create: { projectId, date: new Date(date), description, isFixed: false, isWorkingDay: false },
  });
  res.status(201).json(holiday);
});

router.put("/holidays/:id", requireCanEdit, requireAdminOrDirecteur, async (req, res) => {
  const { isWorkingDay, date, description } = req.body;
  const existing = await prisma.calendarException.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError(404, "Holiday not found");
  // Fixed (auto-calculated) holidays: only isWorkingDay may be toggled —
  // date/description edits are rejected, matching updateCustomHoliday's
  // typeFixe==="Non" guard in the legacy code.
  const data = existing.isFixed
    ? { isWorkingDay }
    : { isWorkingDay, ...(date ? { date: new Date(date) } : {}), ...(description ? { description } : {}) };
  res.json(await prisma.calendarException.update({ where: { id: req.params.id }, data }));
});

router.delete("/holidays/:id", requireCanEdit, requireAdminOrDirecteur, async (req, res) => {
  await prisma.calendarException.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// Marks an auto-calculated holiday's override in the DB the first time its
// working-day status is toggled (since computed holidays don't exist as
// rows until customized) — used by the frontend instead of a raw PUT when
// the row doesn't have an id yet.
router.post("/holidays/:projectId/override", requireCanEdit, requireAdminOrDirecteur, async (req, res) => {
  const { projectId } = req.params;
  const { date, description, isWorkingDay } = req.body;
  const holiday = await prisma.calendarException.upsert({
    where: { projectId_date_description: { projectId, date: new Date(date), description } },
    update: { isWorkingDay },
    create: { projectId, date: new Date(date), description, isFixed: true, isWorkingDay },
  });
  res.json(holiday);
});

export default router;
