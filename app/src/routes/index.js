import { Router } from "express";
import authRoutes from "./auth.routes.js";
import projectRoutes from "./projects.routes.js";
import reserveRoutes from "./reserves.routes.js";
import scheduleRoutes from "./schedule.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/projects", projectRoutes);
router.use("/reserves", reserveRoutes);
router.use("/schedule", scheduleRoutes);

// TODO: buildings, units, edl, users, permissions, logs, configurations,
// photos/upload routes — add once schema is finalized from the
// spreadsheet analysis (see TODO.md).

export default router;
