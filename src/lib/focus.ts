import type { ContextFocus } from "@/components/views/ContextualChatView";
import type { Context } from "./context-client";

type CalendarEvent = Context["calendar"][number];
type SlackHighlight = Context["slack_highlights"][number];
type CompetitorUpdate = Context["competitor_updates"][number];
type Todo = Context["todos"][number];


export function focusCalendarEvent(event: CalendarEvent): ContextFocus {
  return {
    title: event.title,
    subtitle: `${event.time} · ${event.duration} · ${event.attendees.join(", ")}`,
    source: "Calendar",
    icon: "📅",
    data: [
      { Time: event.time, Duration: event.duration, Attendees: event.attendees.join(", ") },
    ],
    suggestedQuestions: [
      `Prep me for this meeting — what should I know?`,
      `What context do I have on ${event.attendees[0] || "the attendees"}?`,
      `Draft talking points for this call`,
      `What are the open items related to this meeting?`,
    ],
    systemContext: `The user is looking at a calendar event: "${event.title}" at ${event.time} (${event.duration}), attendees: ${event.attendees.join(", ")}. Help them prepare for this meeting.`,
  };
}

export function focusMetric(key: string, metric: { value: number; change: string; period: string; unit?: string }): ContextFocus {
  const label = key.toUpperCase();
  const unit = metric.unit || "";
  return {
    title: `${label} Analytics`,
    subtitle: `${metric.value}${unit} (${metric.change} over ${metric.period})`,
    source: "Analytics",
    icon: "📊",
    data: [
      { Metric: label, Value: `${metric.value}${unit}`, Change: metric.change, Period: metric.period },
    ],
    suggestedQuestions: [
      `What's driving the ${metric.change} change in ${label}?`,
      `How does ${label} compare to last month?`,
      `What actions could improve ${label}?`,
      `Break down ${label} by segment`,
    ],
    systemContext: `The user is analyzing the ${label} metric: current value is ${metric.value}${unit}, change of ${metric.change} over ${metric.period}. Help them understand what's driving this metric and what they can do about it.`,
  };
}

export function focusSlackMessage(highlight: SlackHighlight): ContextFocus {
  const topic = highlight.message.split("—")[0]?.trim() || highlight.message.slice(0, 60);
  return {
    title: topic,
    subtitle: `${highlight.channel} · ${highlight.time}`,
    source: "Slack",
    icon: "💬",
    data: [
      { Channel: highlight.channel, Message: highlight.message, Time: highlight.time },
    ],
    suggestedQuestions: [
      `Tell me more about this`,
      `What's the background on this?`,
      `What should I do about this?`,
      `Draft a response`,
    ],
    systemContext: `The user is looking at a Slack message from ${highlight.channel} (${highlight.time}): "${highlight.message}". Help them understand the context and take action.`,
  };
}

export function focusCompetitor(update: CompetitorUpdate): ContextFocus {
  return {
    title: update.competitor,
    subtitle: update.event,
    source: update.source,
    icon: "🔍",
    data: [
      { Competitor: update.competitor, Update: update.event, Source: update.source, When: update.time },
    ],
    suggestedQuestions: [
      `What does this mean for us?`,
      `How should we respond to this?`,
      `Compare ${update.competitor} to our current positioning`,
      `What are ${update.competitor}'s weaknesses we can exploit?`,
    ],
    systemContext: `The user is analyzing a competitor update: ${update.competitor} — "${update.event}" (source: ${update.source}, ${update.time}). Help them assess the competitive implications and suggest strategic responses.`,
  };
}

export function focusTodo(todo: Todo): ContextFocus {
  return {
    title: todo.text,
    subtitle: todo.done ? "Completed" : "Not started",
    source: "Todo",
    icon: todo.done ? "✅" : "☐",
    data: [
      { Task: todo.text, Status: todo.done ? "Done" : "Pending" },
    ],
    suggestedQuestions: [
      `Help me get started on this`,
      `Break this down into subtasks`,
      `Delegate this — draft a message to the team`,
      `What context do I need before starting this?`,
    ],
    systemContext: `The user is looking at a todo item: "${todo.text}" (status: ${todo.done ? "done" : "pending"}). Help them take action on this task — break it down, delegate it, or get started.`,
  };
}
