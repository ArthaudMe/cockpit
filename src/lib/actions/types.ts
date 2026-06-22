export type ActionType =
  | "linear_create_issue"
  | "github_comment_pr"
  | "slack_send_message"
  | "calendar_create_event"
  | "gmail_draft"
  | "gmail_send"
  | "notion_update_page";

export interface ActionBlock {
  cockpit_action: ActionType;
  params: Record<string, unknown>;
  confirm: boolean; // true = show card and wait for approval
}

export interface ActionResult {
  success: boolean;
  message: string;
  url?: string;
  data?: Record<string, unknown>;
}

export interface ActionLogEntry {
  id: string;
  action: ActionType;
  params: Record<string, unknown>;
  result: ActionResult;
  timestamp: string;
  approved: boolean;
}
