import type { DatasourceData } from "@/lib/datasources/types";

export interface SuggestedTodo {
  id: string;
  text: string;
  source: string;
  url?: string;
}

/**
 * Derive actionable todo suggestions from live datasource data.
 * Returns at most one suggestion per source type (Linear, GitHub, etc.).
 */
export function inferSuggestedTodos(data: DatasourceData): SuggestedTodo[] {
  const suggestions: SuggestedTodo[] = [];

  // One Linear suggestion — pick the most recently updated actionable issue
  const linearIssue = (data.linearIssues || []).find((issue) => {
    const state = issue.state.toLowerCase();
    return state === "todo" || state === "in progress" || state === "backlog";
  });
  if (linearIssue) {
    suggestions.push({
      id: `linear:${linearIssue.id}`,
      text: linearIssue.title,
      source: "Linear",
      url: linearIssue.url,
    });
  }

  // One GitHub suggestion — pick the first open PR
  const openPR = (data.githubPRs || []).find((pr) => pr.status === "open");
  if (openPR) {
    suggestions.push({
      id: `github:${openPR.url || openPR.repo + ":" + openPR.title}`,
      text: `Review PR: ${openPR.title}`,
      source: "GitHub",
      url: openPR.url,
    });
  }

  return suggestions;
}
