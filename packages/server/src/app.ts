import compression from "compression";
import cors from "cors";
import express, { Express } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { AppDatabase } from "./db";
import { RuntimeManager } from "./runtime";
import { buildRouter } from "./routes";
import { buildMvcRouter } from "./routes/mvc-routes";
import { DataSource } from "typeorm";
import { errorHandler } from "./middleware/error-handler";

export function createApp(db: AppDatabase, runtime: RuntimeManager, dataSource?: DataSource): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("dev"));
  const origin = process.env.MQTT_POSTWOMAN_ORIGIN ?? "http://localhost:5173";
  app.use(cors({ origin, credentials: true }));
  if (dataSource) app.use("/api", buildMvcRouter(dataSource, db, runtime));
  app.use("/api", buildRouter(db, runtime));
  app.use(errorHandler);
  return app;
}
