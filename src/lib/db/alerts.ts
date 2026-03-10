import { getDb } from "./index";

export type DbAlert = {
  id: number;
  source: string;
  title: string;
  body: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  read: number;
  actioned: number;
  raw_payload: string | null;
  created_at: string;
};

export type DbBriefing = {
  id: number;
  type: string;
  content: string;
  metadata: string | null;
  created_at: string;
};

// --- Alerts ---

export function createAlert(alert: {
  source: string;
  title: string;
  body?: string;
  priority?: DbAlert["priority"];
  rawPayload?: unknown;
}): DbAlert {
  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO alerts (source, title, body, priority, raw_payload) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      alert.source,
      alert.title,
      alert.body || null,
      alert.priority || "normal",
      alert.rawPayload ? JSON.stringify(alert.rawPayload) : null,
    );

  return db
    .prepare("SELECT * FROM alerts WHERE id = ?")
    .get(result.lastInsertRowid) as DbAlert;
}

export function getAlerts(options?: {
  unreadOnly?: boolean;
  limit?: number;
}): DbAlert[] {
  const db = getDb();
  const limit = options?.limit ?? 50;

  if (options?.unreadOnly) {
    return db
      .prepare(
        "SELECT * FROM alerts WHERE read = 0 ORDER BY created_at DESC LIMIT ?",
      )
      .all(limit) as DbAlert[];
  }

  return db
    .prepare("SELECT * FROM alerts ORDER BY created_at DESC LIMIT ?")
    .all(limit) as DbAlert[];
}

export function getUnreadAlertCount(): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) as count FROM alerts WHERE read = 0")
    .get() as { count: number };
  return row.count;
}

export function markAlertRead(id: number): void {
  const db = getDb();
  db.prepare("UPDATE alerts SET read = 1 WHERE id = ?").run(id);
}

export function markAlertActioned(id: number): void {
  const db = getDb();
  db.prepare(
    "UPDATE alerts SET actioned = 1, read = 1 WHERE id = ?",
  ).run(id);
}

export function markAllAlertsRead(): void {
  const db = getDb();
  db.prepare("UPDATE alerts SET read = 1 WHERE read = 0").run();
}

export function deleteAlert(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM alerts WHERE id = ?").run(id);
}

// --- Briefings ---

export function createBriefing(briefing: {
  type: string;
  content: string;
  metadata?: unknown;
}): DbBriefing {
  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO briefings (type, content, metadata) VALUES (?, ?, ?)",
    )
    .run(
      briefing.type,
      briefing.content,
      briefing.metadata ? JSON.stringify(briefing.metadata) : null,
    );

  return db
    .prepare("SELECT * FROM briefings WHERE id = ?")
    .get(result.lastInsertRowid) as DbBriefing;
}

export function getLatestBriefing(type: string): DbBriefing | null {
  const db = getDb();
  return (
    (db
      .prepare(
        "SELECT * FROM briefings WHERE type = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(type) as DbBriefing | undefined) || null
  );
}

export function getBriefings(options?: {
  type?: string;
  limit?: number;
}): DbBriefing[] {
  const db = getDb();
  const limit = options?.limit ?? 20;

  if (options?.type) {
    return db
      .prepare(
        "SELECT * FROM briefings WHERE type = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(options.type, limit) as DbBriefing[];
  }

  return db
    .prepare("SELECT * FROM briefings ORDER BY created_at DESC LIMIT ?")
    .all(limit) as DbBriefing[];
}
