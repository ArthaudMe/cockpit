// ─── Types ───────────────────────────────────────────────────────────

export type SkillId =
  | "meeting-prep"
  | "writer"
  | "research"
  | "product-manager"
  | "data-analyst"
  | "builder"
  | "ux-design"
  | "user-feedback"
  | "eng-manager"
  | "people-manager"
  | "sales-pipeline"
  | "content-marketing";

export type SkillCategory = "leadership" | "product" | "strategy" | "growth";

export interface SkillDef {
  id: SkillId;
  name: string;
  slash: string;
  icon: string;
  description: string;
  category: SkillCategory;
  promptInstruction: string;
  triggerHints: string[];
  outputFormat: string;
}

// ─── Skill Definitions ──────────────────────────────────────────────

export const SKILLS: SkillDef[] = [
  {
    id: "meeting-prep",
    name: "Meeting Prep & Follow-up",
    slash: "/prep",
    icon: "◎",
    description: "Prepare briefs before meetings and generate follow-up action items after",
    category: "leadership",
    promptInstruction: `When the user asks you to prepare for a meeting or follow up on one:
- For PREP: summarize attendees, their roles, agenda items, any recent context from projects, and 3-5 talking points. Output as a card_grid with one card per agenda item.
- For FOLLOW-UP: extract action items, decisions made, and owners. Output as a table with columns: Action, Owner, Deadline.
- Always be concise and founder-focused — what do THEY need to know or do?`,
    triggerHints: ["meeting", "prep", "prepare for", "follow up", "action items", "agenda", "debrief"],
    outputFormat: "card_grid or table",
  },
  {
    id: "writer",
    name: "Writer",
    slash: "/write",
    icon: "✎",
    description: "Draft emails, memos, docs, proposals, SOPs — any written communication",
    category: "leadership",
    promptInstruction: `When the user asks you to write, draft, or compose anything:
- Match the founder's voice: direct, clear, no corporate fluff
- For emails: include subject line, keep it short, offer tone variants if sensitive
- For memos: context → decision needed → recommendation
- For proposals: problem → solution → timeline → cost
- For SOPs: steps → owners → edge cases
- For any document: use clear headers, sections, executive-ready formatting
- Provide the full draft ready to use — don't outline unless explicitly asked
- Keep it practical — founders don't write novels`,
    triggerHints: ["draft", "write", "compose", "email", "memo", "brief", "proposal", "SOP", "document", "reply to", "message to", "one-pager", "announcement"],
    outputFormat: "text with markdown",
  },
  {
    id: "research",
    name: "Research & Intel",
    slash: "/research",
    icon: "◉",
    description: "Deep research on markets, competitors, trends, and strategic questions",
    category: "strategy",
    promptInstruction: `When the user asks you to research something:
- Be thorough but structured — use sections
- Compare options with pros/cons in tables
- Cite specific data points when possible
- End with a clear recommendation or key takeaway
- For competitor analysis, use a comparison table with key dimensions
- Output structured data as tables or card_grids when it helps comparison`,
    triggerHints: ["research", "compare", "competitor", "market", "analyze", "investigate", "look into", "what do you know about", "landscape"],
    outputFormat: "text + table",
  },
  {
    id: "product-manager",
    name: "Product Manager",
    slash: "/pm",
    icon: "◧",
    description: "PRDs, feature specs, roadmap planning, prioritization, sprint planning",
    category: "product",
    promptInstruction: `When the user asks about product decisions, features, or planning:
- For PRDs: problem statement → target user → success metrics → requirements → out of scope → timeline
- For prioritization: use a table with Impact, Effort, Confidence, and a recommended order. Use ICE or RICE frameworks when appropriate.
- For roadmap: organize by time horizon (Now / Next / Later) with clear rationale, output as card_grid
- For sprint planning: break features into shippable chunks with estimates and dependencies
- For feature specs: user stories, acceptance criteria, edge cases
- Always tie back to user value and business impact — kill scope creep early`,
    triggerHints: ["PRD", "feature", "roadmap", "prioritize", "sprint", "spec", "requirements", "scope", "ship", "backlog", "user story", "acceptance criteria"],
    outputFormat: "card_grid + table",
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    slash: "/data",
    icon: "▥",
    description: "Analyze metrics, KPIs, cohorts, funnels, and data-driven decisions",
    category: "strategy",
    promptInstruction: `When the user asks about data, metrics, or analysis:
- Lead with the insight, not the numbers — what does this MEAN?
- Use bar_chart for comparisons, trends, and distributions
- Use tables for detailed breakdowns and cohort analysis
- Always contextualize: is this good or bad? What's the trend? How does it compare?
- For funnels: show conversion at each step with drop-off percentages
- For cohorts: table with time periods as rows, metrics as columns
- Suggest actions based on the data — don't just report, recommend
- Compare to benchmarks or previous periods when possible`,
    triggerHints: ["metrics", "KPI", "data", "numbers", "analytics", "dashboard", "trend", "growth rate", "churn", "MRR", "ARR", "cohort", "funnel", "conversion", "retention"],
    outputFormat: "bar_chart + table",
  },
  {
    id: "builder",
    name: "Builder",
    slash: "/build",
    icon: "⚙",
    description: "Technical scoping, architecture decisions, prototyping, implementation planning",
    category: "product",
    promptInstruction: `When the user asks about building something, technical decisions, or implementation:
- For scoping: break into components, estimate complexity (S/M/L), identify risks and unknowns
- For architecture: present options as a comparison table with tradeoffs (speed, cost, scalability, complexity)
- For prototyping: suggest the fastest path to a testable version — what's the MVP?
- For implementation: ordered task list with dependencies, output as a table
- For "should we build or buy": structured comparison with total cost of ownership
- Think like a technical co-founder — pragmatic, opinionated, focused on shipping`,
    triggerHints: ["build", "implement", "architect", "prototype", "MVP", "technical", "stack", "infrastructure", "deploy", "scale", "migrate", "refactor", "build vs buy"],
    outputFormat: "table + text",
  },
  {
    id: "ux-design",
    name: "UX & Design",
    slash: "/ux",
    icon: "◑",
    description: "User flows, wireframe descriptions, usability audits, design critiques",
    category: "product",
    promptInstruction: `When the user asks about UX, design, or user experience:
- For user flows: describe step-by-step with decision points, output as a numbered list or card_grid
- For wireframes: describe layout, key elements, and interactions in enough detail to hand to a designer
- For usability audits: identify friction points with severity (Critical/Major/Minor) in a table
- For design critiques: structure as What Works → What Doesn't → Recommendations
- For onboarding: map the first-time user journey, identify drop-off risks
- Always ground decisions in user behavior, not aesthetics — what makes users succeed?`,
    triggerHints: ["UX", "design", "user flow", "wireframe", "usability", "onboarding", "user experience", "interface", "layout", "navigation", "friction", "accessibility"],
    outputFormat: "card_grid or table",
  },
  {
    id: "user-feedback",
    name: "User Feedback & Insights",
    slash: "/feedback",
    icon: "◈",
    description: "Synthesize feedback, analyze NPS, prioritize feature requests, spot churn signals",
    category: "product",
    promptInstruction: `When the user asks about user feedback, feature requests, or customer insights:
- For feedback synthesis: group by theme, rank by frequency and impact, output as a table
- For NPS/surveys: highlight key drivers of satisfaction and dissatisfaction, show distribution in bar_chart
- For feature requests: prioritize by demand × impact, flag quick wins, output as a table with Request, Frequency, Effort, Recommendation
- For churn signals: identify at-risk patterns and early warning signs
- For support patterns: recurring issues in a table with Frequency, Impact, Root Cause, Suggested Fix
- Always connect feedback to actionable product decisions — what should we build/fix/change?`,
    triggerHints: ["feedback", "NPS", "survey", "feature request", "churn", "satisfaction", "complaint", "user interview", "support ticket", "bug report", "voice of customer"],
    outputFormat: "table + bar_chart",
  },
  {
    id: "eng-manager",
    name: "Engineering Manager",
    slash: "/eng",
    icon: "◫",
    description: "Tech debt, incident reviews, team velocity, architecture decisions, code quality",
    category: "leadership",
    promptInstruction: `When the user asks about engineering management, technical operations, or team performance:
- For tech debt: categorize by risk and effort, recommend what to pay down now vs later, output as a table with Item, Risk, Effort, Priority
- For incidents/postmortems: structure as Timeline → Root Cause → Impact → Action Items → Prevention
- For velocity/performance: track trends, identify bottlenecks, compare to past sprints in bar_chart
- For architecture decisions: ADR format — Context, Decision, Consequences, Alternatives Considered
- For code quality: identify systemic issues, not nitpicks — what patterns cause the most bugs?
- Think like a VP Eng — balance shipping speed with sustainability`,
    triggerHints: ["tech debt", "incident", "postmortem", "velocity", "sprint", "architecture decision", "code quality", "deployment", "CI/CD", "outage", "reliability", "engineering team"],
    outputFormat: "table + text",
  },
  {
    id: "people-manager",
    name: "People & Team",
    slash: "/team",
    icon: "◍",
    description: "1:1 prep, performance reviews, hiring, team health, delegation, org design",
    category: "leadership",
    promptInstruction: `When the user asks about managing people, team dynamics, or organizational decisions:
- For 1:1 prep: suggest topics based on context, provide coaching questions not scripts, output as card_grid
- For performance reviews: structure as Strengths → Growth Areas → Goals → Feedback, be specific not generic
- For hiring: write compelling JDs focused on impact, suggest evaluation criteria, provide structured interview questions
- For team health: identify signals of burnout, disengagement, or conflict — suggest interventions
- For delegation: help decide what to delegate, to whom, and how to set up for success
- For org design: structure options with tradeoffs in a table
- Be direct but humane — people management is about clarity and care`,
    triggerHints: ["1:1", "one on one", "performance review", "hire", "hiring", "JD", "job description", "team health", "delegate", "org chart", "promotion", "firing", "PIP", "culture", "onboard", "offboard", "candidate"],
    outputFormat: "card_grid or table",
  },
  {
    id: "sales-pipeline",
    name: "Sales Pipeline",
    slash: "/sales",
    icon: "◆",
    description: "Track deals, prep for sales calls, and analyze pipeline health",
    category: "growth",
    promptInstruction: `When the user asks about sales or pipeline:
- Summarize pipeline stages and deal values
- For call prep: company background, key contacts, talking points, objection handling
- For pipeline review: show deals in a table with Stage, Value, Next Step, Risk Level
- Always focus on what action the founder should take next
- Use bar_chart for pipeline value by stage`,
    triggerHints: ["sales", "pipeline", "deal", "prospect", "lead", "close", "revenue", "call prep", "objection", "quota"],
    outputFormat: "table + bar_chart",
  },
  {
    id: "content-marketing",
    name: "Content & Marketing",
    slash: "/content",
    icon: "◐",
    description: "Marketing content, social posts, blog outlines, campaigns, and launch planning",
    category: "growth",
    promptInstruction: `When the user asks about content or marketing:
- Match the brand voice — ask if unsure
- For social: provide multiple variants with different hooks
- For blogs: provide outline + key points, not full drafts unless asked
- For campaigns: structure as Audience → Message → Channel → CTA
- For launches: timeline with milestones in a table
- Keep it authentic — founders hate generic marketing speak`,
    triggerHints: ["content", "blog", "social", "marketing", "campaign", "launch", "post", "newsletter", "announcement", "LinkedIn", "Twitter", "SEO"],
    outputFormat: "text",
  },
];

// ─── Slash Command Expansion (client-safe) ──────────────────────────

/**
 * If the message starts with a skill slash command (e.g. "/prep tomorrow's board meeting"),
 * returns { skill, expandedMessage }. Returns null if no match.
 * `enabledSkills` should be the list of currently enabled skill IDs.
 */
export function expandSlashCommand(
  message: string,
  enabledSkills?: SkillId[]
): { skill: SkillDef; expandedMessage: string } | null {
  const pool = enabledSkills
    ? SKILLS.filter((s) => enabledSkills.includes(s.id))
    : SKILLS;
  const trimmed = message.trim();

  for (const skill of pool) {
    if (trimmed.startsWith(skill.slash + " ") || trimmed === skill.slash) {
      const rest = trimmed.slice(skill.slash.length).trim();
      const expandedMessage = rest
        ? `[Using ${skill.name} skill] ${rest}`
        : `[Using ${skill.name} skill] Help me with this.`;
      return { skill, expandedMessage };
    }
  }

  return null;
}
