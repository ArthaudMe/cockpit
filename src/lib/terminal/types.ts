// Messages from client to server (JSON text frames)
export type ClientMessage =
  | {
      type: "create";
      sessionId: string;
      args?: string[];
      cwd?: string;
    }
  | { type: "resize"; cols: number; rows: number }
  | { type: "kill" };

// Messages from server to client (JSON text frames)
export type ServerMessage =
  | { type: "started"; pid: number; sessionId: string }
  | { type: "exit"; code: number; sessionId: string }
  | { type: "error"; message: string };

// Binary frames are raw PTY I/O (no wrapping)
