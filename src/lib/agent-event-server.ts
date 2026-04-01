/**
 * Agent Event Server
 *
 * Local HTTP server on 127.0.0.1:0 (random port) that receives
 * structured events from spawned agents via hooks/callbacks.
 *
 * Events are emitted to listeners registered per agent ID.
 */

import http from "http";
import { randomBytes } from "crypto";

export type AgentEventType =
  | "status"      // Agent became idle/busy
  | "notification" // Agent wants to show a notification
  | "stop"         // Agent stopped (completed or errored)
  | "tool_use"     // Agent is using a tool
  | "progress";    // Agent progress update

export interface AgentEvent {
  agentId: string;
  type: AgentEventType;
  message?: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

type EventListener = (event: AgentEvent) => void;

let server: http.Server | null = null;
let serverPort = 0;
let authToken = "";
const listeners = new Map<string, Set<EventListener>>();
const globalListeners = new Set<EventListener>();

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  // Only accept POST to /hook
  if (req.method !== "POST" || !req.url?.startsWith("/hook")) {
    res.writeHead(404);
    res.end();
    return;
  }

  // Verify auth token
  const token = req.headers["x-cockpit-token"] as string;
  if (token !== authToken) {
    res.writeHead(401);
    res.end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    try {
      const payload = JSON.parse(body);
      const event: AgentEvent = {
        agentId: payload.agentId || "unknown",
        type: payload.type || "notification",
        message: payload.message,
        data: payload.data,
        timestamp: Date.now(),
      };

      // Dispatch to agent-specific listeners
      const agentListeners = listeners.get(event.agentId);
      if (agentListeners) {
        for (const listener of agentListeners) {
          try { listener(event); } catch (err) {
            console.error("[agent-events] listener error:", err);
          }
        }
      }

      // Dispatch to global listeners
      for (const listener of globalListeners) {
        try { listener(event); } catch (err) {
          console.error("[agent-events] global listener error:", err);
        }
      }

      console.log("[agent-events] %s: %s %s", event.agentId, event.type, event.message || "");

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400);
      res.end("Invalid JSON");
    }
  });
}

export function startEventServer(): Promise<{ port: number; token: string }> {
  if (server) {
    return Promise.resolve({ port: serverPort, token: authToken });
  }

  authToken = randomBytes(16).toString("hex");

  return new Promise((resolve, reject) => {
    server = http.createServer(handleRequest);

    server.listen(0, "127.0.0.1", () => {
      const addr = server!.address();
      if (typeof addr === "object" && addr) {
        serverPort = addr.port;
        console.log("[agent-events] listening on 127.0.0.1:%d", serverPort);
        resolve({ port: serverPort, token: authToken });
      } else {
        reject(new Error("Failed to bind event server"));
      }
    });

    server.on("error", (err) => {
      console.error("[agent-events] server error:", err);
      reject(err);
    });
  });
}

export function stopEventServer() {
  if (server) {
    server.close();
    server = null;
    serverPort = 0;
    console.log("[agent-events] stopped");
  }
}

export function getEventServerInfo(): { port: number; token: string } | null {
  if (!server || !serverPort) return null;
  return { port: serverPort, token: authToken };
}

export function onAgentEvent(agentId: string, listener: EventListener): () => void {
  if (!listeners.has(agentId)) {
    listeners.set(agentId, new Set());
  }
  listeners.get(agentId)!.add(listener);

  return () => {
    listeners.get(agentId)?.delete(listener);
  };
}

export function onAnyAgentEvent(listener: EventListener): () => void {
  globalListeners.add(listener);
  return () => { globalListeners.delete(listener); };
}

export function removeAgentListeners(agentId: string) {
  listeners.delete(agentId);
}
