import { createAlert } from "@/lib/db/alerts";
import { evaluateWebhook } from "./filter";
import { handleLinearWebhook } from "./handlers/linear";
import { handleGitHubWebhook } from "./handlers/github";
import { handleSlackWebhook } from "./handlers/slack";

export type WebhookResult = {
  title: string;
  body?: string;
  source: string;
};

type WebhookHandler = (
  payload: unknown,
) => WebhookResult | null;

const handlers: Record<string, WebhookHandler> = {
  linear: handleLinearWebhook,
  github: handleGitHubWebhook,
  slack: handleSlackWebhook,
};

export async function routeWebhook(
  source: string,
  payload: unknown,
): Promise<{ alertCreated: boolean; alertId?: number }> {
  // Run through filter engine
  const filterResult = evaluateWebhook(source, payload);

  if (!filterResult.shouldAlert) {
    return { alertCreated: false };
  }

  // Run source-specific handler to extract title/body
  const handler = handlers[source];
  const result = handler ? handler(payload) : null;

  if (!result) {
    return { alertCreated: false };
  }

  // Create alert
  const alert = createAlert({
    source: result.source,
    title: result.title,
    body: result.body,
    priority: filterResult.priority,
    rawPayload: payload,
  });

  return { alertCreated: true, alertId: alert.id };
}
