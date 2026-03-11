import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import type { ClientMessage, ServerMessage } from "./src/lib/terminal/types";

const PORT = parseInt(process.env.TERMINAL_PORT || "3003", 10);
const RECONNECT_TIMEOUT = 60_000; // 60s reconnect window
const REPLAY_BUFFER_SIZE = 50 * 1024; // 50KB replay buffer

type Session = {
  id: string;
  pty: pty.IPty;
  ws: WebSocket | null;
  replayBuffer: string;
  killTimer: ReturnType<typeof setTimeout> | null;
};

const sessions = new Map<string, Session>();

function sendJson(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function createSession(
  ws: WebSocket,
  sessionId: string,
  args: string[] = [],
  cwd?: string,
) {
  // If session exists, reattach
  const existing = sessions.get(sessionId);
  if (existing) {
    if (existing.killTimer) {
      clearTimeout(existing.killTimer);
      existing.killTimer = null;
    }
    existing.ws = ws;

    // Replay buffered output
    if (existing.replayBuffer) {
      ws.send(existing.replayBuffer);
    }

    sendJson(ws, {
      type: "started",
      pid: existing.pty.pid,
      sessionId,
    });
    return;
  }

  // Spawn new PTY with claude
  const shell = "claude";
  const shellArgs = args.length > 0 ? args : [];

  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: cwd || process.env.HOME || "/",
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    } as Record<string, string>,
  });

  const session: Session = {
    id: sessionId,
    pty: ptyProcess,
    ws,
    replayBuffer: "",
    killTimer: null,
  };

  sessions.set(sessionId, session);

  // Stream PTY output to WebSocket
  ptyProcess.onData((data: string) => {
    // Append to replay buffer (ring buffer)
    session.replayBuffer += data;
    if (session.replayBuffer.length > REPLAY_BUFFER_SIZE) {
      session.replayBuffer = session.replayBuffer.slice(
        -REPLAY_BUFFER_SIZE,
      );
    }

    if (session.ws?.readyState === WebSocket.OPEN) {
      session.ws.send(data);
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    if (session.ws?.readyState === WebSocket.OPEN) {
      sendJson(session.ws, {
        type: "exit",
        code: exitCode,
        sessionId,
      });
    }
    sessions.delete(sessionId);
  });

  sendJson(ws, {
    type: "started",
    pid: ptyProcess.pid,
    sessionId,
  });

  console.log(
    `[terminal] Session ${sessionId} started (PID ${ptyProcess.pid})`,
  );
}

function handleDisconnect(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return;

  session.ws = null;

  // Start kill timer — if no reconnect within timeout, kill PTY
  session.killTimer = setTimeout(() => {
    console.log(
      `[terminal] Session ${sessionId} timed out, killing PTY`,
    );
    try {
      session.pty.kill();
    } catch {
      // Already dead
    }
    sessions.delete(sessionId);
  }, RECONNECT_TIMEOUT);

  console.log(
    `[terminal] Session ${sessionId} disconnected, ${RECONNECT_TIMEOUT / 1000}s to reconnect`,
  );
}

// --- WebSocket Server ---

const wss = new WebSocketServer({ port: PORT });

wss.on("listening", () => {
  console.log(`[terminal] WebSocket server listening on port ${PORT}`);
});

wss.on("connection", (ws) => {
  let currentSessionId: string | null = null;

  ws.on("message", (data, isBinary) => {
    // Binary frames = raw input to PTY
    if (isBinary || (typeof data !== "string" && !isJsonText(data))) {
      if (currentSessionId) {
        const session = sessions.get(currentSessionId);
        if (session?.pty) {
          session.pty.write(data.toString());
        }
      }
      return;
    }

    // Text frames = control messages
    const raw = data.toString();

    // Quick check: if it doesn't start with '{', treat as PTY input
    if (!raw.startsWith("{")) {
      if (currentSessionId) {
        const session = sessions.get(currentSessionId);
        if (session?.pty) {
          session.pty.write(raw);
        }
      }
      return;
    }

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      // Not JSON — send as raw input
      if (currentSessionId) {
        const session = sessions.get(currentSessionId);
        if (session?.pty) {
          session.pty.write(raw);
        }
      }
      return;
    }

    switch (msg.type) {
      case "create": {
        currentSessionId = msg.sessionId;
        createSession(ws, msg.sessionId, msg.args, msg.cwd);
        break;
      }
      case "resize": {
        if (currentSessionId) {
          const session = sessions.get(currentSessionId);
          if (session?.pty) {
            session.pty.resize(msg.cols, msg.rows);
          }
        }
        break;
      }
      case "kill": {
        if (currentSessionId) {
          const session = sessions.get(currentSessionId);
          if (session) {
            try {
              session.pty.kill();
            } catch {
              // Already dead
            }
            sessions.delete(currentSessionId);
          }
          currentSessionId = null;
        }
        break;
      }
    }
  });

  ws.on("close", () => {
    if (currentSessionId) {
      handleDisconnect(currentSessionId);
    }
  });

  ws.on("error", (err) => {
    console.error("[terminal] WebSocket error:", err.message);
    if (currentSessionId) {
      handleDisconnect(currentSessionId);
    }
  });
});

function isJsonText(data: unknown): boolean {
  if (Buffer.isBuffer(data)) {
    const str = data.toString();
    return str.startsWith("{");
  }
  return false;
}

// Cleanup on exit
process.on("SIGINT", () => {
  console.log("[terminal] Shutting down...");
  for (const [id, session] of sessions) {
    try {
      session.pty.kill();
    } catch {
      // ignore
    }
    sessions.delete(id);
  }
  wss.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  process.emit("SIGINT" as unknown as "SIGTERM");
});
