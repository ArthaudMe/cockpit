import type { ContextFocus } from "@/components/views/ContextualChatView";
import type { Context } from "./context-client";

type CalendarEvent = Context["calendar"][number];
type SlackHighlight = Context["slack_highlights"][number];
type CompetitorUpdate = Context["competitor_updates"][number];
type Todo = Context["todos"][number];
type Project = Context["projects"][number];

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

export function focusProject(project: Project): ContextFocus {
  const linear = project.linear;
  const github = project.github;
  const issuesSummary = linear
    ? `${linear.completed}/${linear.total_issues} issues done, ${linear.in_progress} in progress`
    : "No Linear data";
  const githubSummary = github
    ? `${github.commits_this_week} commits, ${github.open_prs} open PRs`
    : "No GitHub data";

  return {
    title: project.name,
    subtitle: `${project.category} · ${project.status}`,
    source: "Project",
    icon: "📁",
    data: [
      { Project: project.name, Category: project.category, Status: project.status },
      { Linear: issuesSummary, GitHub: githubSummary },
      ...(project.people.length > 0
        ? [{ Team: project.people.map((p: { name: string; role: string }) => `${p.name} (${p.role})`).join(", ") }]
        : []),
    ],
    suggestedQuestions: [
      `Give me a full status update`,
      `What are the blockers right now?`,
      `Summarize this week's progress`,
      `What should the team focus on next?`,
    ],
    systemContext: `The user is focused on project "${project.name}" (${project.category}, ${project.status}). Tools: ${project.tools.join(", ")}. ${issuesSummary}. ${githubSummary}. Team: ${project.people.map((p: { name: string; role: string }) => `${p.name} (${p.role})`).join(", ")}. Key decisions: ${project.key_decisions.join("; ") || "none recorded"}. Help them understand the project status and take action.`,
  };
}

export function focusProjectLinear(project: Project): ContextFocus {
  const linear = project.linear!;
  return {
    title: `${project.name} — Linear`,
    subtitle: `${linear.project} · ${linear.completed}/${linear.total_issues} done`,
    source: "Linear",
    icon: "📋",
    data: linear.recent_issues.map((i: { id: string; title: string; assignee: string; state: string; priority: string }) => ({
      ID: i.id,
      Title: i.title,
      Assignee: i.assignee,
      State: i.state,
      Priority: i.priority,
    })),
    suggestedQuestions: [
      `What are the urgent blockers?`,
      `Summarize sprint progress`,
      `Which issues are at risk?`,
      `What should ${linear.recent_issues[0]?.assignee || "the team"} focus on?`,
    ],
    systemContext: `The user is looking at the Linear board for "${project.name}". Project: ${linear.project}. ${linear.completed}/${linear.total_issues} issues completed, ${linear.in_progress} in progress, ${linear.backlog} in backlog. ${linear.current_cycle ? `Current cycle: ${linear.current_cycle} (${Math.round((linear.cycle_progress || 0) * 100)}% complete)` : "No active cycle"}. Issues: ${linear.recent_issues.map((i: { id: string; title: string; state: string; priority: string; assignee: string }) => `${i.id} "${i.title}" (${i.state}, ${i.priority}, ${i.assignee})`).join("; ")}`,
  };
}

export function focusProjectGitHub(project: Project): ContextFocus {
  const github = project.github!;
  return {
    title: `${project.name} — GitHub`,
    subtitle: `${github.repo} · ${github.commits_this_week} commits this week`,
    source: "GitHub",
    icon: "🐙",
    data: github.recent_prs.map((pr: { title: string; author: string; status: string; time: string }) => ({
      PR: pr.title,
      Author: pr.author,
      Status: pr.status,
      Time: pr.time,
    })),
    suggestedQuestions: [
      `Summarize this week's code changes`,
      `Which PRs need review?`,
      `What are the top contributors working on?`,
      `Are there any risky changes?`,
    ],
    systemContext: `The user is looking at GitHub for "${project.name}" (${github.repo}). ${github.commits_this_week} commits this week, ${github.open_prs} open PRs, ${github.merged_this_week} merged. Top contributors: ${github.top_contributors.join(", ")}. Recent PRs: ${github.recent_prs.map((pr: { title: string; author: string; status: string; time: string }) => `"${pr.title}" by ${pr.author} (${pr.status}, ${pr.time})`).join("; ")}`,
  };
}

export function focusProjectSlack(project: Project): ContextFocus {
  const slack = project.slack!;
  return {
    title: `${project.name} — Slack`,
    subtitle: `${slack.channel} · ${slack.messages_today} messages today`,
    source: "Slack",
    icon: "💬",
    data: slack.recent.map((m: { author: string; message: string; time: string }) => ({
      Author: m.author,
      Message: m.message,
      Time: m.time,
    })),
    suggestedQuestions: [
      `Summarize today's discussion`,
      `What are the key takeaways?`,
      `Are there any action items I missed?`,
      `Draft a reply to the latest message`,
    ],
    systemContext: `The user is looking at Slack channel ${slack.channel} for project "${project.name}". ${slack.messages_today} messages today. Recent messages: ${slack.recent.map((m: { author: string; time: string; message: string }) => `${m.author} (${m.time}): "${m.message}"`).join("; ")}`,
  };
}

export function focusMeeting(meeting: { title: string; time: string; duration: string; source: string; attendees: string[]; notes: string | null }, projectName: string): ContextFocus {
  return {
    title: meeting.title,
    subtitle: `${meeting.time} · ${meeting.duration} · ${meeting.attendees.join(", ")}`,
    source: meeting.source,
    icon: "📅",
    data: [
      { Time: meeting.time, Duration: meeting.duration, Source: meeting.source },
      { Attendees: meeting.attendees.join(", ") },
      ...(meeting.notes ? [{ Notes: meeting.notes }] : []),
    ],
    suggestedQuestions: [
      `Prep me for this meeting`,
      `What context do I have on the attendees?`,
      `Draft an agenda`,
      `What are the open items to discuss?`,
    ],
    systemContext: `The user is preparing for a meeting: "${meeting.title}" at ${meeting.time} (${meeting.duration}), from ${meeting.source}, attendees: ${meeting.attendees.join(", ")}. Part of project "${projectName}". ${meeting.notes ? `Notes: ${meeting.notes}` : "No notes yet."}. Help them prepare.`,
  };
}

export function focusPerson(person: { name: string; role: string; active_issues: number; commits_this_week: number }, projectName: string): ContextFocus {
  return {
    title: person.name,
    subtitle: `${person.role} · ${projectName}`,
    source: "Team",
    icon: "👤",
    data: [
      { Name: person.name, Role: person.role, "Active Issues": person.active_issues, "Commits": person.commits_this_week },
    ],
    suggestedQuestions: [
      `What is ${person.name} working on?`,
      `How is ${person.name}'s workload?`,
      `Draft a check-in message for ${person.name}`,
      `What blockers does ${person.name} have?`,
    ],
    systemContext: `The user is looking at team member ${person.name} (${person.role}) on project "${projectName}". ${person.active_issues} active issues, ${person.commits_this_week} commits this week. Help the user understand this person's workload and contributions.`,
  };
}

export function focusIssue(issue: { id: string; title: string; assignee: string; state: string; priority: string }, projectName: string): ContextFocus {
  return {
    title: `${issue.id}: ${issue.title}`,
    subtitle: `${issue.assignee} · ${issue.state} · ${issue.priority}`,
    source: "Linear",
    icon: issue.state === "Done" ? "✅" : issue.state === "In Progress" ? "🔵" : "⬜",
    data: [
      { ID: issue.id, Title: issue.title, Assignee: issue.assignee, State: issue.state, Priority: issue.priority },
    ],
    suggestedQuestions: [
      issue.state === "In Progress" ? `What's the status on this?` : `What needs to happen to move this forward?`,
      `What's blocking this issue?`,
      `Give me context on why this matters`,
      `Draft an update for ${issue.assignee} on this`,
    ],
    systemContext: `The user clicked on Linear issue ${issue.id}: "${issue.title}" (assigned to ${issue.assignee}, state: ${issue.state}, priority: ${issue.priority}) in project "${projectName}". Help them understand the issue, check on blockers, or take action.`,
  };
}

export function focusPR(pr: { title: string; author: string; status: string; time: string }, projectName: string, repo: string): ContextFocus {
  return {
    title: pr.title,
    subtitle: `${pr.author} · ${pr.status} · ${pr.time}`,
    source: "GitHub",
    icon: pr.status === "merged" ? "✅" : "🔀",
    data: [
      { PR: pr.title, Author: pr.author, Status: pr.status, Time: pr.time, Repo: repo },
    ],
    suggestedQuestions: [
      pr.status === "open" ? `What does this PR change?` : `Summarize what was merged`,
      pr.status === "open" ? `Who should review this?` : `Were there any concerns with this merge?`,
      `What issue does this relate to?`,
      `What's the risk level of these changes?`,
    ],
    systemContext: `The user clicked on a GitHub PR: "${pr.title}" by ${pr.author} (status: ${pr.status}, ${pr.time}) in ${repo} for project "${projectName}". Help them understand the changes, review status, or take action.`,
  };
}

export function focusSlackChannelMessage(msg: { author: string; message: string; time: string }, channel: string, projectName: string): ContextFocus {
  return {
    title: msg.message.length > 60 ? msg.message.slice(0, 60) + "…" : msg.message,
    subtitle: `${msg.author} in ${channel} · ${msg.time}`,
    source: "Slack",
    icon: "💬",
    data: [
      { Author: msg.author, Channel: channel, Message: msg.message, Time: msg.time },
    ],
    suggestedQuestions: [
      `What's the context behind this?`,
      `What should I respond?`,
      `Is there an action item here?`,
      `Draft a reply`,
    ],
    systemContext: `The user clicked on a Slack message from ${msg.author} in ${channel} (${msg.time}): "${msg.message}". Part of project "${projectName}". Help them understand the context and respond or take action.`,
  };
}

export function focusActivityEvent(event: { date: string; event: string; source: string }, projectName: string): ContextFocus {
  return {
    title: event.event,
    subtitle: `${event.source} · ${event.date}`,
    source: event.source,
    icon: event.source === "GitHub" ? "🐙" : event.source === "Slack" ? "💬" : event.source === "Linear" ? "📋" : "📝",
    data: [
      { Event: event.event, Source: event.source, Date: event.date },
    ],
    suggestedQuestions: [
      `Tell me more about this`,
      `What was the outcome?`,
      `How does this affect the project?`,
      `What should I do about this?`,
    ],
    systemContext: `The user clicked on a project activity event: "${event.event}" (source: ${event.source}, ${event.date}) in project "${projectName}". Help them understand the context and implications.`,
  };
}

export function focusDecision(decision: string, projectName: string): ContextFocus {
  return {
    title: decision,
    subtitle: `Key decision · ${projectName}`,
    source: "Decision",
    icon: "⚡",
    data: [
      { Decision: decision, Project: projectName },
    ],
    suggestedQuestions: [
      `Why did we make this decision?`,
      `What are the trade-offs?`,
      `Should we revisit this?`,
      `What are the implications?`,
    ],
    systemContext: `The user clicked on a key project decision: "${decision}" in project "${projectName}". Help them understand the reasoning, trade-offs, and whether this decision should be revisited.`,
  };
}
