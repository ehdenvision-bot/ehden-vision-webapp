import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { body, validationResult } from "express-validator";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { sendMail } from "../lib/mailer.js";

const router = Router();

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: user.role?.name || null,
      canEdit: user.role?.canEdit ?? false,
      isClientRole: user.role?.isClientRole ?? true,
    },
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
      include: { role: true },
    });
    if (!user || user.status !== "Actif") throw new ApiError(401, "Invalid credentials");
    if (!user.passwordHash) throw new ApiError(401, "Invalid credentials");

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new ApiError(401, "Invalid credentials");

    const token = signToken(user);

    res
      .cookie("token", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" })
      .json({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role?.name || null,
          canEdit: user.role?.canEdit ?? false,
          isClientRole: user.role?.isClientRole ?? true,
        },
      });
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
  res.json({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role?.name || null,
    canEdit: user.role?.canEdit ?? false,
    isClientRole: user.role?.isClientRole ?? true,
  });
});

// Anti-enumeration: always returns the same generic response, matching the
// legacy gsRequestPasswordReset behavior — mirrors Reset_Code.js's approach.
router.post("/reset-request", body("email").isEmail(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ApiError(400, "Invalid input", errors.array());

  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = crypto.randomUUID();
    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    const link = `${req.protocol}://${req.get("host")}/reset?token=${token}`;
    await sendMail({
      to: email,
      subject: "Réinitialisation de votre mot de passe",
      text: `Cliquez sur ce lien pour définir un nouveau mot de passe (valide 1h) : ${link}`,
    });
  }
  res.json({ ok: true, message: "Si cette adresse est enregistrée, un lien de réinitialisation a été envoyé." });
});

router.post(
  "/reset",
  body("token").isString().notEmpty(),
  body("newPassword").isString().isLength({ min: 8 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new ApiError(400, "Invalid input", errors.array());

    const { token, newPassword } = req.body;
    const record = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new ApiError(400, "Le lien a expiré ou est invalide.");
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { token }, data: { usedAt: new Date() } }),
    ]);
    res.json({ ok: true });
  }
);

export default router;
