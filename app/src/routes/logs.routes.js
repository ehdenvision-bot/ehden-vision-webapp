import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const { projectId, entityKind, take = "50", skip = "0" } = req.query;
  const logs = await prisma.activityLog.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      ...(entityKind ? { entityKind } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(take) || 50, 200),
    skip: Number(skip) || 0,
  });
  res.json(logs);
});

router.get("/errors", async (req, res) => {
  const { treated } = req.query;
  const errors = await prisma.errorLog.findMany({
    where: treated !== undefined ? { treated: treated === "true" } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(errors);
});

export default router;
