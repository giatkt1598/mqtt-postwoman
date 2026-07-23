import "reflect-metadata";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { createApp } from "./app";
import { initializeDatabase } from "./database/data-source";
import { bootstrapState, openDatabase } from "./db";
import { RealtimeEvent, RuntimeManager } from "./runtime";

async function main() {
  // TypeORM owns schema creation and migrations. The legacy facade remains available
  // for compatibility while the HTTP/runtime layers are moved to repositories.
  const dataSource = await initializeDatabase();
  const db = openDatabase();

  const sockets = new Set<WebSocket>();
  const broadcaster = (event: RealtimeEvent) => {
    const payload = JSON.stringify(event);
    for (const socket of sockets) if (socket.readyState === socket.OPEN) socket.send(payload);
  };
  const runtime = new RuntimeManager(db, broadcaster);
  const app = createApp(db, runtime, dataSource);

  const webDist = path.resolve(__dirname, "../../web/dist");
  if (fs.existsSync(webDist)) {
    app.use(require("express").static(webDist));
    app.use((req: any, res: any, next: any) => {
      if (req.path.startsWith("/api") || (req.method !== "GET" && req.method !== "HEAD")) return next();
      return res.sendFile(path.join(webDist, "index.html"));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (socket) => {
    sockets.add(socket);
    socket.send(JSON.stringify({ type: "bootstrap", payload: bootstrapState(db.raw) }));
    socket.on("close", () => sockets.delete(socket));
  });

  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => console.log(`MQTT Postwoman running on http://localhost:${port}`));
}

main().catch((error) => {
  console.error("Unable to start MQTT Postwoman", error);
  process.exitCode = 1;
});
