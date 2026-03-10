import { getDb } from "./index";

export type DbMessage = {
  id: number;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  focus_context: string | null;
  created_at: string;
};

export type DbConversation = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export function createConversation(id: string, title?: string): void {
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO conversations (id, title) VALUES (?, ?)",
  ).run(id, title || null);
}

export function addMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  focusContext?: string,
): DbMessage {
  const db = getDb();

  // Ensure conversation exists
  createConversation(conversationId);

  const result = db
    .prepare(
      "INSERT INTO messages (conversation_id, role, content, focus_context) VALUES (?, ?, ?, ?)",
    )
    .run(conversationId, role, content, focusContext || null);

  // Update conversation timestamp
  db.prepare(
    "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?",
  ).run(conversationId);

  return db
    .prepare("SELECT * FROM messages WHERE id = ?")
    .get(result.lastInsertRowid) as DbMessage;
}

export function getMessages(
  conversationId: string,
  limit = 50,
): DbMessage[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?",
    )
    .all(conversationId, limit) as DbMessage[];
}

export function getConversations(limit = 20): DbConversation[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?",
    )
    .all(limit) as DbConversation[];
}

export function updateConversationTitle(
  id: string,
  title: string,
): void {
  const db = getDb();
  db.prepare("UPDATE conversations SET title = ? WHERE id = ?").run(
    title,
    id,
  );
}

export function deleteConversation(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(id);
  db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
}
