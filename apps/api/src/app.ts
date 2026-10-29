import cors from "cors";
import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { apiRouter } from "./routes/api-routes.js";
import { logger } from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(): Express {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
          callback(null, true);
        } else {
          callback(new Error("Origin not allowed by CORS"));
        }
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: "256kb" }));

  // Basic structured request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      if (process.env.NODE_ENV !== "test") {
        logger.debug(`${req.method} ${req.originalUrl}`, {
          statusCode: res.statusCode,
          durationMs: Date.now() - start,
        });
      }
    });
    next();
  });

  app.use("/api", apiRouter);

  // Serve built frontend in production if available
  const webDistPath = path.resolve(__dirname, "../../web/dist");
  if (fs.existsSync(webDistPath) && process.env.NODE_ENV === "production") {
    app.use(express.static(webDistPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) {
        next();
        return;
      }
      res.sendFile(path.join(webDistPath, "index.html"));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
