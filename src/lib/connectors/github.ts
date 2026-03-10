import type { Connector, ConnectorData, FeedItem } from "./types";
import { getConnectorConfig } from "@/lib/config";

type GHPullRequest = {
  number: number;
  title: string;
  state: string;
  merged_at: string | null;
  user: { login: string };
  created_at: string;
  updated_at: string;
};

type GHCommit = {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
};

async function ghFetch(token: string, path: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export class GitHubConnector implements Connector {
  id = "github" as const;
  name = "GitHub";

  isConfigured(): boolean {
    return !!getConnectorConfig("github");
  }

  async fetchContext(): Promise<ConnectorData> {
    const config = getConnectorConfig("github");
    if (!config) return {};

    const repos = config.repos?.length
      ? config.repos
      : await this.discoverRepos(config.token, config.org);

    const feed: FeedItem[] = [];
    const githubDataByRepo: Record<
      string,
      NonNullable<ConnectorData["projects"]>[number]["github"]
    > = {};

    // Fetch data for each repo (limit to 5 repos)
    for (const repo of repos.slice(0, 5)) {
      const repoPath = `/${config.org}/${repo}`;

      const [prs, commits] = await Promise.all([
        ghFetch(
          config.token,
          `/repos${repoPath}/pulls?state=all&sort=updated&per_page=10`,
        ) as Promise<GHPullRequest[]>,
        ghFetch(
          config.token,
          `/repos${repoPath}/commits?per_page=30`,
        ) as Promise<GHCommit[]>,
      ]);

      // Count commits this week
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentCommits = commits.filter(
        (c) => new Date(c.commit.author.date).getTime() > weekAgo,
      );

      // Build sparkline (commits per day, last 7 days)
      const sparkline = Array(7).fill(0);
      for (const c of recentCommits) {
        const daysAgo = Math.floor(
          (Date.now() - new Date(c.commit.author.date).getTime()) /
            (24 * 60 * 60 * 1000),
        );
        if (daysAgo < 7) sparkline[6 - daysAgo]++;
      }

      // Top contributors
      const contributors: Record<string, number> = {};
      for (const c of recentCommits) {
        const name = c.commit.author.name;
        contributors[name] = (contributors[name] || 0) + 1;
      }
      const topContributors = Object.entries(contributors)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name);

      const openPrs = prs.filter((pr) => pr.state === "open");
      const mergedThisWeek = prs.filter(
        (pr) =>
          pr.merged_at &&
          new Date(pr.merged_at).getTime() > weekAgo,
      );

      githubDataByRepo[repo] = {
        repo: `${config.org}/${repo}`,
        open_prs: openPrs.length,
        merged_this_week: mergedThisWeek.length,
        commits_this_week: recentCommits.length,
        top_contributors: topContributors,
        recent_prs: prs.slice(0, 5).map((pr) => ({
          title: pr.title,
          author: pr.user.login,
          status: pr.merged_at ? "merged" : pr.state,
          time: timeAgo(pr.updated_at),
        })),
        activity_sparkline: sparkline,
      };

      // Add to feed
      for (const pr of prs.slice(0, 3)) {
        feed.push({
          type: "code",
          actor: pr.user.login,
          event: `${pr.merged_at ? "Merged" : pr.state === "open" ? "Opened" : "Closed"} PR: ${pr.title}`,
          project: repo,
          time: timeAgo(pr.updated_at),
          icon: pr.merged_at ? "✅" : "🔀",
        });
      }
    }

    return { feed };
  }

  private async discoverRepos(
    token: string,
    org: string,
  ): Promise<string[]> {
    const repos = await ghFetch(
      token,
      `/orgs/${org}/repos?sort=updated&per_page=5`,
    );
    return repos.map(
      (r: { name: string }) => r.name,
    );
  }

  async getRepoData(repoName: string) {
    const config = getConnectorConfig("github");
    if (!config) return null;

    const repoPath = `/${config.org}/${repoName}`;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const [prs, commits] = await Promise.all([
      ghFetch(
        config.token,
        `/repos${repoPath}/pulls?state=all&sort=updated&per_page=10`,
      ) as Promise<GHPullRequest[]>,
      ghFetch(
        config.token,
        `/repos${repoPath}/commits?per_page=30`,
      ) as Promise<GHCommit[]>,
    ]);

    const recentCommits = commits.filter(
      (c) => new Date(c.commit.author.date).getTime() > weekAgo,
    );
    const sparkline = Array(7).fill(0);
    for (const c of recentCommits) {
      const daysAgo = Math.floor(
        (Date.now() - new Date(c.commit.author.date).getTime()) /
          (24 * 60 * 60 * 1000),
      );
      if (daysAgo < 7) sparkline[6 - daysAgo]++;
    }

    const contributors: Record<string, number> = {};
    for (const c of recentCommits) {
      const name = c.commit.author.name;
      contributors[name] = (contributors[name] || 0) + 1;
    }

    return {
      repo: `${config.org}/${repoName}`,
      open_prs: prs.filter((pr) => pr.state === "open").length,
      merged_this_week: prs.filter(
        (pr) => pr.merged_at && new Date(pr.merged_at).getTime() > weekAgo,
      ).length,
      commits_this_week: recentCommits.length,
      top_contributors: Object.entries(contributors)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name),
      recent_prs: prs.slice(0, 5).map((pr) => ({
        title: pr.title,
        author: pr.user.login,
        status: pr.merged_at ? "merged" : pr.state,
        time: timeAgo(pr.updated_at),
      })),
      activity_sparkline: sparkline,
    };
  }
}
