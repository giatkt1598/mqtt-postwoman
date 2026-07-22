import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import http from "http";
import morgan from "morgan";
import path from "path";
import fs from "fs";
import { WebSocket, WebSocketServer } from "ws";
import { openDatabase, bootstrapState } from "./db";
import { RuntimeManager, RealtimeEvent } from "./runtime";
import { buildRouter } from "./routes";

const db = openDatabase();
db.init();

const app = express();
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

const origin = process.env.MQTT_POSTWOMAN_ORIGIN ?? "http://localhost:5173";
app.use(cors({ origin, credentials: true }));

const server = http.createServer(app);

const sockets = new Set<WebSocket>();
const broadcaster = (event: RealtimeEvent) => {
  const payload = JSON.stringify(event);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
};

const runtime = new RuntimeManager(db, broadcaster);
const router = buildRouter(db, runtime);
app.use("/api", router);

const webDist = path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    res.sendFile(path.join(webDist, "index.html"));
  });
}

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (socket) => {
  sockets.add(socket);
  socket.send(JSON.stringify({ type: "bootstrap", payload: bootstrapState(db.raw) }));
  socket.on("close", () => sockets.delete(socket));
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`MQTT Postwoman running on http://localhost:${port}`);
});
