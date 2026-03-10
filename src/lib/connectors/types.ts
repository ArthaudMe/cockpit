export type ConnectorData = {
  projects?: ProjectData[];
  calendar?: CalendarEvent[];
  metrics?: Record<string, MetricData>;
  slackHighlights?: SlackHighlight[];
  competitorUpdates?: CompetitorUpdate[];
  todos?: Todo[];
  feed?: FeedItem[];
};

export type ProjectData = {
  name: string;
  category: string;
  status: string;
  recent_activity: { date: string; event: string; source: string }[];
  key_decisions: string[];
  tools: string[];
  github: {
    repo: string;
    open_prs: number;
    merged_this_week: number;
    commits_this_week: number;
    top_contributors: string[];
    recent_prs: {
      title: string;
      author: string;
      status: string;
      time: string;
    }[];
    activity_sparkline: number[];
  } | null;
  linear: {
    project: string;
    total_issues: number;
    completed: number;
    in_progress: number;
    backlog: number;
    current_cycle: string | null;
    cycle_progress: number | null;
    recent_issues: {
      id: string;
      title: string;
      assignee: string;
      state: string;
      priority: string;
    }[];
  } | null;
  slack: {
    channel: string;
    messages_today: number;
    recent: { author: string; message: string; time: string }[];
  } | null;
  meetings: {
    title: string;
    time: string;
    duration: string;
    source: string;
    attendees: string[];
    notes: string | null;
  }[];
  people: {
    name: string;
    role: string;
    active_issues: number;
    commits_this_week: number;
  }[];
};

export type CalendarEvent = {
  title: string;
  time: string;
  duration: string;
  attendees: string[];
};

export type MetricData = {
  value: number;
  change: string;
  period: string;
  unit?: string;
};

export type SlackHighlight = {
  channel: string;
  message: string;
  time: string;
};

export type CompetitorUpdate = {
  competitor: string;
  event: string;
  source: string;
  time: string;
};

export type Todo = {
  text: string;
  done: boolean;
};

export type FeedItem = {
  type: string;
  actor: string;
  event: string;
  project: string | null;
  time: string;
  icon: string;
};

export interface Connector {
  id: string;
  name: string;
  fetchContext(): Promise<ConnectorData>;
  isConfigured(): boolean;
}
