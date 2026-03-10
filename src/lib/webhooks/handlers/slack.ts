import type { WebhookResult } from "../router";

type SlackEventPayload = {
  type: string;
  challenge?: string;
  event?: {
    type: string;
    text?: string;
    user?: string;
    channel?: string;
    channel_type?: string;
    ts?: string;
  };
};

export function handleSlackWebhook(
  payload: unknown,
): WebhookResult | null {
  const data = payload as SlackEventPayload;

  // URL verification challenge
  if (data.type === "url_verification") {
    return null; // Handled separately in the route
  }

  if (!data.event) return null;

  const event = data.event;
  const text = event.text?.slice(0, 200) || "";
  const user = event.user || "Unknown";
  const channel = event.channel || "Unknown channel";

  if (event.type === "app_mention") {
    return {
      title: `Mentioned by ${user} in ${channel}`,
      body: text,
      source: "Slack",
    };
  }

  if (event.type === "message" && event.channel_type === "im") {
    return {
      title: `DM from ${user}`,
      body: text,
      source: "Slack",
    };
  }

  if (event.type === "message") {
    return {
      title: `Message in ${channel}`,
      body: `${user}: ${text}`,
      source: "Slack",
    };
  }

  return null;
}

/**
 * Check if this is a Slack URL verification challenge.
 * Returns the challenge string if it is, null otherwise.
 */
export function getSlackChallenge(payload: unknown): string | null {
  const data = payload as SlackEventPayload;
  if (data.type === "url_verification" && data.challenge) {
    return data.challenge;
  }
  return null;
}
