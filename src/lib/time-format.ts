// Timestamp helpers shared across connectors.
//
// Connectors historically emitted the same field three different ways: relative
// text ("2h ago"), toLocaleString(), and ISO. That drift corrupted history
// dedup, search ranking, and project-inference recency (all of which need a
// stable, machine-parseable timestamp). The rule now: connectors carry a stable
// ISO `timestamp` for machine use and may still carry a human `time` for
// display. Use toISO() to produce the former and relativeTime() for the latter.

/** Coerce any date-ish input to an ISO 8601 string, or "" if unparseable. */
export function toISO(input: string | number | Date | undefined | null): string {
  if (input === undefined || input === null || input === "") return "";
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** Human "just now" / "3h ago" / "2d ago" from an ISO string (for display). */
export function relativeTime(iso: string | number | Date | undefined | null): string {
  if (!iso) return "";
  const t = iso instanceof Date ? iso.getTime() : new Date(iso).getTime();
  if (Number.isNaN(t)) return typeof iso === "string" ? iso : "";
  const diffH = Math.round((Date.now() - t) / 3_600_000);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.round(diffH / 24)}d ago`;
}
