import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { fetchAllData } from "@/lib/datasources/manager";
import { getProjects, setProjects, type Project } from "@/lib/projects/store";

function cleanEnv() {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return env;
}

async function askClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", ["-p", "--output-format", "text"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: cleanEnv(),
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr || `Exit code ${code}`));
      else resolve(stdout.trim());
    });

    proc.stdin?.write(prompt);
    proc.stdin?.end();
  });
}

export async function POST() {
  try {
    const liveData = await fetchAllData();
    const existingProjects = getProjects();

    // Build a summary of all datasource data for Claude to analyze
    const dataSummary: string[] = [];

    if (liveData.linearIssues?.length) {
      dataSummary.push(
        `## Linear Issues (${liveData.linearIssues.length}):\n` +
          liveData.linearIssues
            .map((i) => `- ${i.id}: ${i.title} [${i.state}] (${i.priority}) project: ${i.project || "none"}`)
            .join("\n")
      );
    }

    if (liveData.githubPRs?.length) {
      dataSummary.push(
        `## GitHub PRs (${liveData.githubPRs.length}):\n` +
          liveData.githubPRs
            .map((pr) => `- ${pr.repo}: ${pr.title} by ${pr.author} [${pr.status}]`)
            .join("\n")
      );
    }

    if (liveData.githubNotifications?.length) {
      dataSummary.push(
        `## GitHub Notifications (${liveData.githubNotifications.length}):\n` +
          liveData.githubNotifications
            .map((n) => `- ${n.repo}: ${n.title} [${n.type}]`)
            .join("\n")
      );
    }

    if (liveData.notionPages?.length) {
      dataSummary.push(
        `## Notion Pages (${liveData.notionPages.length}):\n` +
          liveData.notionPages
            .map((p) => `- ${p.title} (edited ${p.lastEdited})`)
            .join("\n")
      );
    }

    if (liveData.calendar?.length) {
      dataSummary.push(
        `## Calendar Events (${liveData.calendar.length}):\n` +
          liveData.calendar
            .slice(0, 10)
            .map((e) => `- ${e.title} (${e.date} ${e.time}) [${e.attendees.join(", ")}]`)
            .join("\n")
      );
    }

    if (liveData.granolaMeetings?.length) {
      dataSummary.push(
        `## Recent Meetings/Granola (${liveData.granolaMeetings.length}):\n` +
          liveData.granolaMeetings
            .slice(0, 8)
            .map((m) => `- ${m.title} (${m.time}) [${m.attendees.join(", ")}]${m.summary ? ` — ${m.summary.slice(0, 100)}` : ""}`)
            .join("\n")
      );
    }

    if (liveData.slackMessages?.length) {
      dataSummary.push(
        `## Slack Messages (${liveData.slackMessages.length}):\n` +
          liveData.slackMessages
            .slice(0, 10)
            .map((s) => `- ${s.channel}: ${s.author}: ${s.message}`)
            .join("\n")
      );
    }

    if (liveData.emails?.length) {
      dataSummary.push(
        `## Recent Emails (${liveData.emails.length}):\n` +
          liveData.emails
            .slice(0, 5)
            .map((e) => `- From: ${e.from} — ${e.subject}`)
            .join("\n")
      );
    }

    if (dataSummary.length === 0) {
      return NextResponse.json({
        projects: existingProjects,
        message: "No datasource data available to analyze",
      });
    }

    const existingList = existingProjects.length
      ? `\n\nExisting projects (do NOT duplicate these):\n${existingProjects.map((p) => `- ${p.name} (${p.category})`).join("\n")}`
      : "";

    const prompt = `You are analyzing a founder's connected tools to identify their active projects. Based on the data below, identify distinct projects they are working on.

For each project, provide:
- name: short project name
- category: one of "Product", "Engineering", "Sales", "Operations", "Marketing", "Other"
- tools: which data sources mention this project (e.g. ["Linear", "GitHub", "Notion"])
- description: one-line summary of what the project is about

${dataSummary.join("\n\n")}${existingList}

Respond with ONLY valid JSON — an array of project objects. No markdown, no explanation. Example:
[{"name": "Dashboard v2", "category": "Product", "tools": ["Linear", "GitHub"], "description": "Redesigning the analytics dashboard"}]`;

    const result = await askClaude(prompt);

    // Parse the JSON from Claude's response
    let suggestedProjects: any[];
    try {
      // Handle case where Claude wraps in markdown code block
      const jsonStr = result.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
      suggestedProjects = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse project suggestions", raw: result },
        { status: 500 }
      );
    }

    // Create projects that don't already exist
    const now = new Date().toISOString();
    const newProjects: Project[] = suggestedProjects
      .filter(
        (sp: any) =>
          !existingProjects.some(
            (ep) => ep.name.toLowerCase() === sp.name?.toLowerCase()
          )
      )
      .map((sp: any) => ({
        id: crypto.randomUUID(),
        name: sp.name,
        category: sp.category || "Other",
        status: "Active" as const,
        tools: sp.tools || [],
        description: sp.description,
        createdAt: now,
        updatedAt: now,
      }));

    const allProjects = [...existingProjects, ...newProjects];
    setProjects(allProjects);

    return NextResponse.json({
      projects: allProjects,
      added: newProjects.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to scan" },
      { status: 500 }
    );
  }
}
