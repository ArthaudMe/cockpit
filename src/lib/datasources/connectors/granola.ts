import fs from "fs";
import path from "path";
import os from "os";
import type { GranolaMeeting } from "../types";

const GRANOLA_CACHE_PATH = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Granola",
  "cache-v6.json"
);

export function isGranolaAvailable(): boolean {
  return fs.existsSync(GRANOLA_CACHE_PATH);
}

// Granola's cache file can be tens of MB; parsing it blocks the event loop
// for the whole JSON.parse. Only re-parse when the file actually changed.
let _cached: { mtimeMs: number; size: number; meetings: GranolaMeeting[] } | null = null;

export function fetchGranolaMeetings(): GranolaMeeting[] {
  let stat;
  try {
    stat = fs.statSync(GRANOLA_CACHE_PATH);
  } catch {
    return [];
  }

  if (_cached && _cached.mtimeMs === stat.mtimeMs && _cached.size === stat.size) {
    return _cached.meetings;
  }

  try {
    const raw = fs.readFileSync(GRANOLA_CACHE_PATH, "utf-8");
    const data = JSON.parse(raw);
    const documents = data?.cache?.state?.documents;
    if (!documents || typeof documents !== "object") return [];

    const withDates: { meeting: GranolaMeeting; createdAt: number }[] = [];
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    for (const doc of Object.values(documents) as any[]) {
      if (doc.deleted_at) continue;
      if (doc.type !== "meeting") continue;

      const createdAt = new Date(doc.created_at).getTime();
      if (createdAt < sevenDaysAgo) continue;

      const attendees: string[] = [];
      if (doc.people?.attendees) {
        for (const a of doc.people.attendees) {
          attendees.push(a.name || a.email || "Unknown");
        }
      } else if (doc.people?.creator) {
        attendees.push(doc.people.creator.name || doc.people.creator.email || "");
      }

      const diffH = Math.round((now - createdAt) / 3_600_000);
      const time =
        diffH < 1
          ? "just now"
          : diffH < 24
            ? `${diffH}h ago`
            : `${Math.round(diffH / 24)}d ago`;

      withDates.push({
        createdAt,
        meeting: {
          title: doc.title || "Untitled meeting",
          time,
          attendees,
          notes: doc.notes_markdown?.slice(0, 500),
          summary: doc.summary?.slice(0, 300),
        },
      });
    }

    // Sort by recency (most recent first)
    withDates.sort((a, b) => b.createdAt - a.createdAt);
    const meetings = withDates.slice(0, 15).map((m) => m.meeting);

    _cached = { mtimeMs: stat.mtimeMs, size: stat.size, meetings };
    return meetings;
  } catch {
    return [];
  }
}
