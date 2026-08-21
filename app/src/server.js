import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";

import routes from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/uploads", express.static(path.resolve(process.env.UPLOAD_DIR || "./uploads")));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api", routes);

// Production build of the React frontend (app/frontend). In local dev, run
// `npm run dev` inside app/frontend instead (Vite dev server on its own
// port, proxying /api and /uploads back to this server — see
// app/frontend/vite.config.js) rather than relying on this static serve.
const frontendDist = path.resolve("frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use(errorHandler);

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`chantier-webapp API listening on http://0.0.0.0:${port}`);
});
