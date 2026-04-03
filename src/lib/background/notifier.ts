import type { BackgroundNotification } from "./rules";

// ─── In-memory notification store ───────────────────────────────────
// Persists for the lifetime of the Next.js server process.
// This is intentional: notifications are ephemeral and reset on restart.

let notifications: BackgroundNotification[] = [];

/**
 * Map of notification ID → timestamp of when it was last emitted.
 * Used for deduplication: we won't re-emit the same notification
 * within the cooldown window.
 */
const lastNotified = new Map<string, number>();

/** Cooldown period: don't re-fire the same notification within this window */
const DEDUP_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

/** Max notifications to keep in memory */
const MAX_NOTIFICATIONS = 100;

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Process raw rule output: dedup, store, and return only new notifications.
 */
export function processNotifications(
  candidates: BackgroundNotification[],
): BackgroundNotification[] {
  const now = Date.now();
  const newNotifications: BackgroundNotification[] = [];

  for (const notif of candidates) {
    const lastTime = lastNotified.get(notif.id);

    // Skip if we already notified within the cooldown window
    if (lastTime && now - lastTime < DEDUP_COOLDOWN_MS) {
      continue;
    }

    // Mark as notified
    lastNotified.set(notif.id, now);
    notifications.push(notif);
    newNotifications.push(notif);
  }

  // Trim old notifications
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications = notifications.slice(-MAX_NOTIFICATIONS);
  }

  // Clean up old dedup entries (older than 2 hours)
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  for (const [key, time] of lastNotified.entries()) {
    if (now - time > TWO_HOURS) {
      lastNotified.delete(key);
    }
  }

  return newNotifications;
}

/**
 * Get all stored notifications.
 */
export function getAllNotifications(): BackgroundNotification[] {
  return [...notifications];
}

/**
 * Get count of unread notifications.
 */
export function getUnreadCount(): number {
  return notifications.filter((n) => !n.read).length;
}

/**
 * Mark specific notifications as read by ID.
 */
export function markAsRead(ids: string[]): void {
  const idSet = new Set(ids);
  for (const n of notifications) {
    if (idSet.has(n.id)) {
      n.read = true;
    }
  }
}

/**
 * Mark all notifications as read.
 */
export function markAllAsRead(): void {
  for (const n of notifications) {
    n.read = true;
  }
}
