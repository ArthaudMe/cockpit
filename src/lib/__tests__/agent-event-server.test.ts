import { describe, it, expect, afterEach } from "vitest";
import {
  startEventServer,
  stopEventServer,
  getEventServerInfo,
  onAgentEvent,
  onAnyAgentEvent,
  removeAgentListeners,
} from "../agent-event-server";

describe("agent-event-server", () => {
  afterEach(async () => {
    await stopEventServer();
  });

  it("starts and returns port + token", async () => {
    await startEventServer();
    const info = getEventServerInfo();
    expect(info).not.toBeNull();
    expect(info!.port).toBeGreaterThan(0);
    expect(info!.token).toBeTruthy();
    expect(typeof info!.token).toBe("string");
    expect(info!.token.length).toBeGreaterThan(10);
  });

  it("returns null info when not started", async () => {
    const info = getEventServerInfo();
    expect(info).toBeNull();
  });

  it("accepts valid hook POST and dispatches to agent listener", async () => {
    await startEventServer();
    const info = getEventServerInfo()!;

    const received: unknown[] = [];
    onAgentEvent("agent-1", (event) => received.push(event));

    const res = await fetch(`http://127.0.0.1:${info.port}/hook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cockpit-Token": info.token,
      },
      body: JSON.stringify({
        agentId: "agent-1",
        type: "notification",
        message: "hello",
      }),
    });

    expect(res.status).toBe(200);

    // Wait a tick for event dispatch
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      agentId: "agent-1",
      type: "notification",
      message: "hello",
    });
  });

  it("dispatches to global listener", async () => {
    await startEventServer();
    const info = getEventServerInfo()!;

    const received: unknown[] = [];
    const unsub = onAnyAgentEvent((event) => received.push(event));

    await fetch(`http://127.0.0.1:${info.port}/hook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cockpit-Token": info.token,
      },
      body: JSON.stringify({
        agentId: "agent-2",
        type: "stop",
        message: "done",
      }),
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(1);
    unsub();
  });

  it("rejects requests without valid token", async () => {
    await startEventServer();
    const info = getEventServerInfo()!;

    const res = await fetch(`http://127.0.0.1:${info.port}/hook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cockpit-Token": "wrong-token",
      },
      body: JSON.stringify({
        agentId: "agent-1",
        type: "notification",
        message: "hello",
      }),
    });

    expect(res.status).toBe(401);
  });

  it("rejects requests without token header", async () => {
    await startEventServer();
    const info = getEventServerInfo()!;

    const res = await fetch(`http://127.0.0.1:${info.port}/hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "agent-1",
        type: "notification",
        message: "hello",
      }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 for non-hook paths", async () => {
    await startEventServer();
    const info = getEventServerInfo()!;

    const res = await fetch(`http://127.0.0.1:${info.port}/other`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cockpit-Token": info.token,
      },
      body: "{}",
    });

    expect(res.status).toBe(404);
  });

  it("removeAgentListeners stops dispatching to that agent", async () => {
    await startEventServer();
    const info = getEventServerInfo()!;

    const received: unknown[] = [];
    onAgentEvent("agent-3", (event) => received.push(event));
    removeAgentListeners("agent-3");

    await fetch(`http://127.0.0.1:${info.port}/hook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cockpit-Token": info.token,
      },
      body: JSON.stringify({
        agentId: "agent-3",
        type: "notification",
        message: "hello",
      }),
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(0);
  });

  it("handles multiple sequential starts (idempotent)", async () => {
    await startEventServer();
    const info1 = getEventServerInfo()!;
    await startEventServer();
    const info2 = getEventServerInfo()!;
    // Should reuse same server
    expect(info2.port).toBe(info1.port);
    expect(info2.token).toBe(info1.token);
  });
});
