/**
 * Sanitise a URL for use in an href attribute.
 *
 * Only allows http(s), mailto, relative paths and anchors.  Anything with an
 * unknown scheme (e.g. `javascript:`) is replaced with "#" so it becomes a
 * no-op when clicked.
 */
export function safeHref(url: string): string {
  const trimmed = url.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (/^[/#]/.test(trimmed)) return trimmed; // relative path or anchor
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed; // no scheme -> relative
  return "#";
}
