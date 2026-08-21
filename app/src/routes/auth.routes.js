import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { body, validationResult } from "express-validator";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function signToken(user, permissions) {
  return jwt.sign(
    { sub: user.id, email: user.email, roleId: user.roleId, permissions },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

router.post(
  "/login",
  body("email").isEmail(),
  body("password").isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new ApiError(400, "Invalid input", errors.array());

    const { email, password } = req.body;
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: { include: { permissions: true } } },
    });
    if (!user || !user.isActive) throw new ApiError(401, "Invalid credentials");

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new ApiError(401, "Invalid credentials");

    const permissions = user.role?.permissions.map((p) => p.code) || [];
    const token = signToken(user, permissions);

    res
      .cookie("token", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" })
      .json({ token, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role?.name } });
  }
);

router.post("/logout", (_req, res) => {
  res.clearCookie("token").json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    include: { role: true },
  });
  if (!user) throw new ApiError(404, "User not found");
  res.json({ id: user.id, email: user.email, fullName: user.fullName, role: user.role?.name });
});

export default router;
