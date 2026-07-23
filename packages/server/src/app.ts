import compression from "compression";
import cors from "cors";
import express, { Express } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { RuntimeService } from "./runtime";
import { buildMvcRouter } from "./routes/mvc-routes";
import { DataSource } from "typeorm";
import { errorHandler } from "./middleware/error-handler";

export function createApp(dataSource: DataSource, runtime: RuntimeService): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("dev"));
  const origin = process.env.MQTT_POSTWOMAN_ORIGIN ?? "http://localhost:5173";
  app.use(cors({ origin, credentials: true }));
  app.use("/api", buildMvcRouter(dataSource, runtime));
  app.use(errorHandler);
  return app;
}
