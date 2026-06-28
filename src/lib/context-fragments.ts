export type ContextFragment = {
  tag: string;
  title?: string;
  body: string;
};

export function renderContextFragment(fragment: ContextFragment): string {
  const header = fragment.title
    ? `<context tag="${fragment.tag}" title="${fragment.title}">`
    : `<context tag="${fragment.tag}">`;

  return `${header}\n${fragment.body.trim()}\n</context>`;
}

export function renderContextFragments(fragments: ContextFragment[]): string {
  return fragments
    .filter((fragment) => fragment.body.trim().length > 0)
    .map(renderContextFragment)
    .join("\n\n");
}
