import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

function requireAdmin(req, _res, next) {
  if (req.user?.roleName !== "Admin") throw new ApiError(403, "Admin only");
  next();
}

router.get("/", requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    include: { role: true },
    orderBy: { fullName: "asc" },
  });
  res.json(
    users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      company: u.company,
      email: u.email,
      role: u.role?.name,
      team: u.team,
      status: u.status,
    }))
  );
});

router.post("/", requireAdmin, async (req, res) => {
  const { fullName, company, email, password, roleId, team } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { fullName, company, email, passwordHash, roleId, team },
  });
  res.status(201).json({ id: user.id, email: user.email });
});

router.put("/:id", requireAdmin, async (req, res) => {
  const { fullName, company, roleId, team, status } = req.body;
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { fullName, company, roleId, team, status },
  });
  res.json({ id: user.id });
});

router.get("/roles", requireAdmin, async (_req, res) => {
  const roles = await prisma.role.findMany({ orderBy: { name: "asc" } });
  res.json(roles);
});

export default router;
