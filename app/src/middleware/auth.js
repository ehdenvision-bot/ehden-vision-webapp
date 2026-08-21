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

// Usage: requirePermission("reserve.write")
export function requirePermission(...codes) {
  return (req, _res, next) => {
    const userCodes = req.user?.permissions || [];
    const ok = codes.every((c) => userCodes.includes(c));
    if (!ok) throw new ApiError(403, "Forbidden");
    next();
  };
}
