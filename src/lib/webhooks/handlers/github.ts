import type { WebhookResult } from "../router";

type GitHubWebhookPayload = {
  action?: string;
  pull_request?: {
    number: number;
    title: string;
    user: { login: string };
    html_url: string;
    merged: boolean;
  };
  review?: {
    state: string;
    user: { login: string };
    body: string;
  };
  check_run?: {
    name: string;
    conclusion: string | null;
    html_url: string;
  };
  issue?: {
    number: number;
    title: string;
    user: { login: string };
  };
  comment?: {
    body: string;
    user: { login: string };
  };
  repository?: {
    full_name: string;
  };
  sender?: {
    login: string;
  };
};

export function handleGitHubWebhook(
  payload: unknown,
): WebhookResult | null {
  const data = payload as GitHubWebhookPayload;
  const repo = data.repository?.full_name || "unknown repo";

  // Pull request events
  if (data.pull_request) {
    const pr = data.pull_request;

    if (data.action === "opened") {
      return {
        title: `New PR #${pr.number}: ${pr.title}`,
        body: `By ${pr.user.login} in ${repo}`,
        source: "GitHub",
      };
    }

    if (data.action === "closed" && pr.merged) {
      return {
        title: `Merged PR #${pr.number}: ${pr.title}`,
        body: `By ${pr.user.login} in ${repo}`,
        source: "GitHub",
      };
    }

    if (data.action === "review_requested") {
      return {
        title: `Review requested on PR #${pr.number}: ${pr.title}`,
        body: `By ${pr.user.login} in ${repo}`,
        source: "GitHub",
      };
    }
  }

  // PR review events
  if (data.review && data.pull_request) {
    const pr = data.pull_request;
    const review = data.review;

    if (data.action === "submitted") {
      const stateLabel =
        review.state === "approved"
          ? "approved"
          : review.state === "changes_requested"
            ? "requested changes on"
            : "commented on";

      return {
        title: `${review.user.login} ${stateLabel} PR #${pr.number}`,
        body: review.body?.slice(0, 200) || pr.title,
        source: "GitHub",
      };
    }
  }

  // Check run (CI) events
  if (data.check_run) {
    const check = data.check_run;

    if (
      data.action === "completed" &&
      check.conclusion === "failure"
    ) {
      return {
        title: `CI failure: ${check.name}`,
        body: `In ${repo}`,
        source: "GitHub",
      };
    }
  }

  // Issue events
  if (data.issue && data.action === "opened") {
    return {
      title: `New issue #${data.issue.number}: ${data.issue.title}`,
      body: `By ${data.issue.user.login} in ${repo}`,
      source: "GitHub",
    };
  }

  // Issue/PR comments
  if (data.comment && data.action === "created") {
    const target = data.pull_request || data.issue;
    if (target) {
      return {
        title: `${data.comment.user.login} commented on #${target.number}`,
        body: data.comment.body.slice(0, 200),
        source: "GitHub",
      };
    }
  }

  return null;
}
