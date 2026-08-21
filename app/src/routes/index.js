import { Router } from "express";
import authRoutes from "./auth.routes.js";
import projectRoutes from "./projects.routes.js";
import reserveRoutes from "./reserves.routes.js";
import buildingRoutes from "./buildings.routes.js";
import edlRoutes from "./edl.routes.js";
import userRoutes from "./users.routes.js";
import logRoutes from "./logs.routes.js";
import scheduleRoutes from "./schedule.routes.js";
import settingsRoutes from "./settings.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/projects", projectRoutes);
router.use("/reserves", reserveRoutes);
router.use("/buildings", buildingRoutes);
router.use("/edl", edlRoutes);
router.use("/users", userRoutes);
router.use("/logs", logRoutes);
router.use("/schedule", scheduleRoutes);
router.use("/settings", settingsRoutes);

export default router;
