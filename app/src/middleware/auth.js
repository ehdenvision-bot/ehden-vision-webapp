import jwt from "jsonwebtoken";
import { ApiError } from "./errorHandler.js";

export function requireAuth(req, _res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) throw new ApiError(401, "Not authenticated");
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    throw new ApiError(401, "Invalid or expired session");
  }
}

// Mirrors assertCanEdit_ in the source app's Security_Code.js: only
// Admin/Directeur/Utilisateur roles can write, and only while the
// project is "Active". Attach this after requireAuth on mutating routes
// that operate on a single project (expects req.project to be loaded,
// e.g. by a prior projectId lookup middleware).
export function requireCanEdit(req, _res, next) {
  if (!req.user?.canEdit) throw new ApiError(403, "Forbidden");
  if (req.project && req.project.status !== "Active") {
    throw new ApiError(409, "Project is not active; editing is locked");
  }
  next();
}
