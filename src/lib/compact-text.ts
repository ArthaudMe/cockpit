const GENERIC_PROJECT_NAMES = new Set([
  "general",
  "mio general",
  "company general",
  "team general",
  "announcements",
  "announcement",
  "random",
  "updates",
  "team updates",
  "slack",
  "messages",
  "inbox",
]);

function decodeCommonEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanupText(value: string): string {
  return decodeCommonEntities(value)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[`*_~>#]/g, "")
    .replace(/[•●▪▫◦]/g, ". ")
    .replace(/\s*[-–]\s+/g, ". ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function limitWords(value: string, maxWords: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return value;
  return `${words.slice(0, maxWords).join(" ").replace(/[,:;.-]+$/, "")}...`;
}

export function compactDisplayText(value: string, maxWords = 20): string {
  const cleaned = cleanupText(value);
  if (!cleaned) return "";

  const firstSentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");

  return limitWords(firstSentences || cleaned, maxWords);
}

export function compactProjectName(value: string, maxWords = 5): string {
  const cleaned = cleanupText(value)
    .replace(/^[^:]{1,30}:\s+/, "")
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/^PR:\s*/i, "")
    .replace(/^Updated:\s*/i, "")
    .replace(/^Opened:\s*/i, "")
    .replace(/^#/, "")
    .replace(/[-_]+/g, " ")
    .trim();

  return limitWords(cleaned, maxWords).replace(/\.$/, "");
}

export function isGenericProjectName(value: string): boolean {
  const normalized = compactProjectName(value, 12).toLowerCase();
  return (
    !normalized ||
    GENERIC_PROJECT_NAMES.has(normalized) ||
    /\bgeneral\b/.test(normalized) ||
    /\b(random|announcement|announcements|updates)\b/.test(normalized)
  );
}
