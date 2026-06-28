export type ServiceId =
  | "google"
  | "linear"
  | "github"
  | "notion"
  | "slack"
  | "granola"
  | "posthog";

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_at?: number; // epoch ms
  scope?: string;
  token_type?: string;
}

export interface DatasourceStatus {
  id: ServiceId;
  name: string;
  connected: boolean;
  icon: string;
  description: string;
  needsOAuth: boolean;
  needsScopeUpgrade?: boolean;
  scopeUpgradeReason?: string;
}

export interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
}

export interface CalendarEvent {
  title: string;
  time: string;
  date: string; // ISO date string e.g. "2026-03-16"
  duration: string;
  attendees: string[];
  description?: string;
  source: string;
}

export interface EmailThread {
  subject: string;
  from: string;
  snippet: string;
  time: string;
  unread: boolean;
}

export interface LinearIssue {
  id: string;
  title: string;
  state: string;
  priority: string;
  assignee: string;
  project?: string;
  updatedAt: string;
}

export interface GitHubPR {
  title: string;
  repo: string;
  author: string;
  status: string;
  time: string;
  url: string;
}

export interface GitHubNotification {
  title: string;
  repo: string;
  type: string;
  time: string;
  url: string;
}

export interface NotionPage {
  title: string;
  lastEdited: string;
  url: string;
  parent?: string;
}

export interface SlackMessage {
  channel: string;
  message: string;
  author: string;
  time: string;
}

export interface GranolaMeeting {
  title: string;
  time: string;
  attendees: string[];
  notes?: string;
  summary?: string;
}

export interface McpResourceItem {
  serverId: string;
  serverName: string;
  uri: string;
  name: string;
  mimeType?: string;
  text: string;
  fetchedAt: number;
}

export type MetricValue = {
  value: number;
  change: string;
  period: string;
  unit?: string;
};

export interface DatasourceData {
  calendar?: CalendarEvent[];
  emails?: EmailThread[];
  linearIssues?: LinearIssue[];
  githubPRs?: GitHubPR[];
  githubNotifications?: GitHubNotification[];
  notionPages?: NotionPage[];
  slackMessages?: SlackMessage[];
  granolaMeetings?: GranolaMeeting[];
  posthogMetrics?: Record<string, MetricValue>;
  mcpResources?: McpResourceItem[];
  _connected?: Record<string, boolean>;
  _offline?: boolean;
  _cachedAt?: number;
}
