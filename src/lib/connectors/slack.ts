import type {
  Connector,
  ConnectorData,
  SlackHighlight,
  FeedItem,
} from "./types";
import { getConnectorConfig } from "@/lib/config";

type SlackMessage = {
  type: string;
  text: string;
  user: string;
  ts: string;
  channel?: string;
};

type SlackChannel = {
  id: string;
  name: string;
  is_member: boolean;
  num_members: number;
};

type SlackUser = {
  id: string;
  name: string;
  real_name: string;
  profile: { display_name: string };
};

async function slackFetch(token: string, method: string, params?: Record<string, string>) {
  const url = new URL(`https://slack.com/api/${method}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Slack API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  return data;
}

function timeAgo(ts: string): string {
  const now = Date.now();
  const then = parseFloat(ts) * 1000;
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export class SlackConnector implements Connector {
  id = "slack" as const;
  name = "Slack";

  isConfigured(): boolean {
    return !!getConnectorConfig("slack");
  }

  async fetchContext(): Promise<ConnectorData> {
    const config = getConnectorConfig("slack");
    if (!config) return {};

    // Get channels the bot is in
    const channelsData = await slackFetch(config.token, "conversations.list", {
      types: "public_channel,private_channel",
      limit: "20",
      exclude_archived: "true",
    });

    const channels: SlackChannel[] = (channelsData.channels || []).filter(
      (c: SlackChannel) => c.is_member,
    );

    // Build user cache
    const userCache: Record<string, string> = {};
    async function getUserName(userId: string): Promise<string> {
      if (userCache[userId]) return userCache[userId];
      try {
        const userData = await slackFetch(config!.token, "users.info", {
          user: userId,
        });
        const user: SlackUser = userData.user;
        const name =
          user.profile.display_name || user.real_name || user.name;
        userCache[userId] = name;
        return name;
      } catch {
        return userId;
      }
    }

    const highlights: SlackHighlight[] = [];
    const feed: FeedItem[] = [];

    // Get recent messages from top channels (limit to 5)
    for (const channel of channels.slice(0, 5)) {
      try {
        const history = await slackFetch(
          config.token,
          "conversations.history",
          {
            channel: channel.id,
            limit: "5",
          },
        );

        const messages: SlackMessage[] = (history.messages || []).filter(
          (m: SlackMessage) => m.type === "message" && !m.text.startsWith("<"),
        );

        for (const msg of messages.slice(0, 2)) {
          const author = await getUserName(msg.user);
          const highlight: SlackHighlight = {
            channel: `#${channel.name}`,
            message: msg.text.slice(0, 200),
            time: timeAgo(msg.ts),
          };
          highlights.push(highlight);

          feed.push({
            type: "message",
            actor: author,
            event: msg.text.slice(0, 100),
            project: null,
            time: timeAgo(msg.ts),
            icon: "💬",
          });
        }
      } catch {
        // Skip channels we can't read
      }
    }

    return {
      slackHighlights: highlights.slice(0, 10),
      feed: feed.slice(0, 10),
    };
  }
}
