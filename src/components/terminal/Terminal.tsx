"use client";

import { useEffect, useRef, useCallback } from "react";

// Dynamic import to avoid SSR issues — xterm.js needs DOM
let XTerm: typeof import("@xterm/xterm").Terminal | null = null;
let FitAddon: typeof import("@xterm/addon-fit").FitAddon | null = null;

type Props = {
  sessionId: string;
  args?: string[];
  cwd?: string;
  wsUrl?: string;
  onExit?: (code: number) => void;
  onStarted?: (pid: number) => void;
};

export function Terminal({
  sessionId,
  args,
  cwd,
  wsUrl = "ws://localhost:3003",
  onExit,
  onStarted,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<InstanceType<typeof import("@xterm/xterm").Terminal> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<InstanceType<typeof import("@xterm/addon-fit").FitAddon> | null>(null);
  const initialized = useRef(false);

  const connect = useCallback(async () => {
    if (initialized.current || !containerRef.current) return;
    initialized.current = true;

    // Dynamic imports
    if (!XTerm) {
      const xtermModule = await import("@xterm/xterm");
      XTerm = xtermModule.Terminal;
    }
    if (!FitAddon) {
      const fitModule = await import("@xterm/addon-fit");
      FitAddon = fitModule.FitAddon;
    }

    // Create terminal
    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: "'SF Mono', Monaco, Inconsolata, 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.3,
      theme: {
        background: "#0a0a0a",
        foreground: "#e0e0e0",
        cursor: "#ffffff",
        cursorAccent: "#0a0a0a",
        selectionBackground: "rgba(255, 255, 255, 0.15)",
        selectionForeground: undefined,
        black: "#1a1a1a",
        red: "#ff4444",
        green: "#44ff88",
        yellow: "#ffaa00",
        blue: "#4488ff",
        magenta: "#cc66ff",
        cyan: "#44ccff",
        white: "#e0e0e0",
        brightBlack: "#555555",
        brightRed: "#ff6666",
        brightGreen: "#66ffaa",
        brightYellow: "#ffcc44",
        brightBlue: "#66aaff",
        brightMagenta: "#dd88ff",
        brightCyan: "#66ddff",
        brightWhite: "#ffffff",
      },
      allowProposedApi: true,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect WebSocket
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Create session
      ws.send(
        JSON.stringify({
          type: "create",
          sessionId,
          args: args || [],
          cwd,
        }),
      );

      // Send initial resize
      ws.send(
        JSON.stringify({
          type: "resize",
          cols: term.cols,
          rows: term.rows,
        }),
      );
    };

    ws.onmessage = (event) => {
      const data = event.data;

      // Try to parse as JSON control message
      if (typeof data === "string" && data.startsWith("{")) {
        try {
          const msg = JSON.parse(data);
          if (msg.type === "started") {
            onStarted?.(msg.pid);
            return;
          }
          if (msg.type === "exit") {
            term.writeln(`\r\n\x1b[90m[Process exited with code ${msg.code}]\x1b[0m`);
            onExit?.(msg.code);
            return;
          }
          if (msg.type === "error") {
            term.writeln(`\r\n\x1b[31m[Error: ${msg.message}]\x1b[0m`);
            return;
          }
        } catch {
          // Not JSON — write as terminal output
        }
      }

      // Raw terminal output
      term.write(data);
    };

    ws.onclose = () => {
      term.writeln("\r\n\x1b[90m[Disconnected from terminal server]\x1b[0m");
    };

    ws.onerror = () => {
      term.writeln(
        "\r\n\x1b[31m[Failed to connect to terminal server. Is terminal-server running?]\x1b[0m",
      );
    };

    // Forward keystrokes to server
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle resize
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    // Auto-fit on container resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    // Store observer for cleanup
    (containerRef.current as HTMLDivElement & { _resizeObserver?: ResizeObserver })._resizeObserver =
      resizeObserver;
  }, [sessionId, args, cwd, wsUrl, onExit, onStarted]);

  useEffect(() => {
    connect();

    return () => {
      // Cleanup
      const container = containerRef.current as
        | (HTMLDivElement & { _resizeObserver?: ResizeObserver })
        | null;
      container?._resizeObserver?.disconnect();
      termRef.current?.dispose();
      wsRef.current?.close();
      initialized.current = false;
    };
  }, [connect]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    />
  );
}
