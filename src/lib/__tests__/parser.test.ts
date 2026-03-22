import { describe, it, expect } from "vitest";
import { parseResponse } from "../parser";

describe("parseResponse", () => {
  // ── Subagent suggestion blocks ──────────────────────────────────────
  describe("subagent suggestions", () => {
    it("parses a single subagent block", () => {
      const input = [
        "```json",
        JSON.stringify({
          cockpit_subagent: true,
          name: "researcher",
          role: "data analyst",
          task: "Find quarterly revenue",
        }),
        "```",
      ].join("\n");

      const result = parseResponse(input);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("subagent_suggestion");
      if (result[0].type === "subagent_suggestion") {
        expect(result[0].suggestion).toEqual({
          name: "researcher",
          role: "data analyst",
          task: "Find quarterly revenue",
        });
      }
    });

    it("defaults role to 'general' when omitted", () => {
      const input = [
        "```json",
        JSON.stringify({ cockpit_subagent: true, name: "coder", task: "Write tests" }),
        "```",
      ].join("\n");

      const result = parseResponse(input);
      expect(result).toHaveLength(1);
      if (result[0].type === "subagent_suggestion") {
        expect(result[0].suggestion.role).toBe("general");
      }
    });
  });

  // ── Skill tags ──────────────────────────────────────────────────────
  describe("skill tags", () => {
    it("parses skill tag on first line", () => {
      const input = "[skill: /research]\nHere is the result.";
      const result = parseResponse(input);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("skill_active");
      if (result[0].type === "skill_active") {
        expect(result[0].skillSlash).toBe("/research");
      }
      expect(result[1].type).toBe("text");
      if (result[1].type === "text") {
        expect(result[1].content).toBe("Here is the result.");
      }
    });

    it("parses skill tag alone with no body", () => {
      const result = parseResponse("[skill: /commit]\n");
      expect(result.some((s) => s.type === "skill_active")).toBe(true);
    });

    it("ignores skill tag not on first line", () => {
      const result = parseResponse("Hello\n[skill: /commit]");
      expect(result.some((s) => s.type === "skill_active")).toBe(false);
    });
  });

  // ── Mixed content ──────────────────────────────────────────────────
  describe("mixed content", () => {
    it("handles text + subagent + text", () => {
      const input = [
        "I recommend delegating this task:",
        "",
        "```json",
        JSON.stringify({
          cockpit_subagent: true,
          name: "writer",
          role: "technical writer",
          task: "Draft the documentation",
        }),
        "```",
        "",
        "Let me know if you'd like to proceed.",
      ].join("\n");

      const result = parseResponse(input);
      expect(result).toHaveLength(3);
      expect(result[0].type).toBe("text");
      expect(result[1].type).toBe("subagent_suggestion");
      expect(result[2].type).toBe("text");
      if (result[0].type === "text") {
        expect(result[0].content).toBe("I recommend delegating this task:");
      }
      if (result[2].type === "text") {
        expect(result[2].content).toBe("Let me know if you'd like to proceed.");
      }
    });

    it("handles skill tag + text + subagent block", () => {
      const input = [
        "[skill: /delegate]",
        "Here is a suggestion:",
        "",
        "```json",
        JSON.stringify({
          cockpit_subagent: true,
          name: "analyst",
          role: "data",
          task: "Run the query",
        }),
        "```",
      ].join("\n");

      const result = parseResponse(input);
      expect(result[0].type).toBe("skill_active");
      expect(result.some((s) => s.type === "subagent_suggestion")).toBe(true);
      expect(result.some((s) => s.type === "text")).toBe(true);
    });
  });

  // ── Incomplete/streaming blocks ────────────────────────────────────
  describe("incomplete/streaming blocks", () => {
    it("shows loading for incomplete fence block", () => {
      const input = [
        "Processing...",
        "",
        "```json",
        '{ "cockpit_subagent": true, "name": "bot",',
      ].join("\n");

      const result = parseResponse(input);
      expect(result.some((s) => s.type === "loading")).toBe(true);
      expect(result.some((s) => s.type === "text" && s.content === "Processing...")).toBe(true);
    });

    it("shows loading for partially streamed JSON", () => {
      const result = parseResponse('```json\n{"cockpit_sub');
      expect(result.some((s) => s.type === "loading")).toBe(true);
    });
  });

  // ── cockpit_render blocks ──────────────────────────────────────────
  describe("cockpit_render blocks", () => {
    it("parses a table render block", () => {
      const tableBlock = {
        cockpit_render: "table",
        title: "Users",
        columns: ["Name", "Email"],
        rows: [["Alice", "alice@example.com"]],
      };
      const input = ["```json", JSON.stringify(tableBlock), "```"].join("\n");
      const result = parseResponse(input);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("render");
      if (result[0].type === "render") {
        expect(result[0].block.cockpit_render).toBe("table");
      }
    });

    it("handles text + bar_chart + text", () => {
      const chartBlock = {
        cockpit_render: "bar_chart",
        title: "Revenue",
        data: [
          { label: "Q1", value: 100 },
          { label: "Q2", value: 200 },
        ],
      };
      const input = [
        "Here are the results:",
        "",
        "```json",
        JSON.stringify(chartBlock),
        "```",
        "",
        "As shown above.",
      ].join("\n");

      const result = parseResponse(input);
      expect(result).toHaveLength(3);
      expect(result[0].type).toBe("text");
      expect(result[1].type).toBe("render");
      expect(result[2].type).toBe("text");
      if (result[1].type === "render") {
        expect(result[1].block.cockpit_render).toBe("bar_chart");
      }
    });

    it("parses card_grid render block", () => {
      const cardBlock = {
        cockpit_render: "card_grid",
        cards: [{ title: "Task 1", status: "done" }],
      };
      const input = ["```json", JSON.stringify(cardBlock), "```"].join("\n");
      const result = parseResponse(input);

      expect(result).toHaveLength(1);
      if (result[0].type === "render") {
        expect(result[0].block.cockpit_render).toBe("card_grid");
      }
    });
  });

  // ── Malformed JSON edge cases ──────────────────────────────────────
  describe("malformed JSON", () => {
    it("handles invalid JSON syntax gracefully", () => {
      const input = [
        "```json",
        '{ "cockpit_subagent": true, "name": "bot", INVALID }',
        "```",
      ].join("\n");

      const result = parseResponse(input);
      expect(result.some((s) => s.type === "subagent_suggestion")).toBe(false);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it("rejects subagent JSON missing 'task'", () => {
      const input = [
        "```json",
        JSON.stringify({ cockpit_subagent: true, name: "bot" }),
        "```",
      ].join("\n");

      const result = parseResponse(input);
      expect(result.some((s) => s.type === "subagent_suggestion")).toBe(false);
    });

    it("rejects subagent JSON missing 'name'", () => {
      const input = [
        "```json",
        JSON.stringify({ cockpit_subagent: true, task: "do something" }),
        "```",
      ].join("\n");

      const result = parseResponse(input);
      expect(result.some((s) => s.type === "subagent_suggestion")).toBe(false);
    });

    it("rejects cockpit_subagent=false", () => {
      const input = [
        "```json",
        JSON.stringify({ cockpit_subagent: false, name: "bot", task: "something" }),
        "```",
      ].join("\n");

      const result = parseResponse(input);
      expect(result.some((s) => s.type === "subagent_suggestion")).toBe(false);
    });

    it("treats generic JSON block as text", () => {
      const input = [
        "```json",
        JSON.stringify({ foo: "bar", count: 42 }),
        "```",
      ].join("\n");

      const result = parseResponse(input);
      expect(result.some((s) => s.type === "render" || s.type === "subagent_suggestion")).toBe(false);
      expect(result.some((s) => s.type === "text")).toBe(true);
    });
  });

  // ── New render block types ─────────────────────────────────────────
  describe("new render block types", () => {
    it("parses metric_cards block", () => {
      const block = {
        cockpit_render: "metric_cards",
        title: "KPIs",
        metrics: [
          { label: "MRR", value: "$12.4k", change: "+8%", period: "vs last month" },
          { label: "Users", value: "1,204", change: "-2%", period: "vs last week" },
        ],
      };
      const input = ["```json", JSON.stringify(block), "```"].join("\n");
      const result = parseResponse(input);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("render");
      if (result[0].type === "render") {
        expect(result[0].block.cockpit_render).toBe("metric_cards");
        if (result[0].block.cockpit_render === "metric_cards") {
          expect(result[0].block.metrics).toHaveLength(2);
          expect(result[0].block.metrics[0].label).toBe("MRR");
          expect(result[0].block.metrics[0].change).toBe("+8%");
        }
      }
    });

    it("parses timeline block", () => {
      const block = {
        cockpit_render: "timeline",
        title: "Recent Activity",
        events: [
          { time: "2h ago", title: "PR merged", description: "Auth refactor", status: "done" },
          { time: "5h ago", title: "Issue created", status: "active" },
          { time: "1d ago", title: "Sprint started", status: "upcoming" },
        ],
      };
      const input = ["```json", JSON.stringify(block), "```"].join("\n");
      const result = parseResponse(input);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("render");
      if (result[0].type === "render") {
        expect(result[0].block.cockpit_render).toBe("timeline");
        if (result[0].block.cockpit_render === "timeline") {
          expect(result[0].block.events).toHaveLength(3);
          expect(result[0].block.events[0].status).toBe("done");
        }
      }
    });

    it("parses kanban block", () => {
      const block = {
        cockpit_render: "kanban",
        title: "Sprint Board",
        columns: [
          { name: "Todo", cards: [{ title: "Fix login bug", subtitle: "ENG-42", tag: "bug" }] },
          { name: "In Progress", cards: [{ title: "Add OAuth", tag: "feature" }] },
          { name: "Done", cards: [] },
        ],
      };
      const input = ["```json", JSON.stringify(block), "```"].join("\n");
      const result = parseResponse(input);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("render");
      if (result[0].type === "render") {
        expect(result[0].block.cockpit_render).toBe("kanban");
        if (result[0].block.cockpit_render === "kanban") {
          expect(result[0].block.columns).toHaveLength(3);
          expect(result[0].block.columns[0].cards[0].tag).toBe("bug");
          expect(result[0].block.columns[2].cards).toHaveLength(0);
        }
      }
    });

    it("parses layout block with nested blocks", () => {
      const block = {
        cockpit_render: "layout",
        title: "Dashboard",
        direction: "row",
        blocks: [
          {
            cockpit_render: "metric_cards",
            metrics: [{ label: "Users", value: "1,204" }],
          },
          {
            cockpit_render: "bar_chart",
            data: [{ label: "Mon", value: 40 }, { label: "Tue", value: 65 }],
          },
        ],
      };
      const input = ["```json", JSON.stringify(block), "```"].join("\n");
      const result = parseResponse(input);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("render");
      if (result[0].type === "render") {
        expect(result[0].block.cockpit_render).toBe("layout");
        if (result[0].block.cockpit_render === "layout") {
          expect(result[0].block.direction).toBe("row");
          expect(result[0].block.blocks).toHaveLength(2);
          expect(result[0].block.blocks[0].cockpit_render).toBe("metric_cards");
          expect(result[0].block.blocks[1].cockpit_render).toBe("bar_chart");
        }
      }
    });

    it("parses layout block with column direction", () => {
      const block = {
        cockpit_render: "layout",
        direction: "column",
        blocks: [
          { cockpit_render: "table", columns: ["A"], rows: [["1"]] },
          { cockpit_render: "timeline", events: [{ time: "now", title: "Test" }] },
        ],
      };
      const input = ["```json", JSON.stringify(block), "```"].join("\n");
      const result = parseResponse(input);

      expect(result).toHaveLength(1);
      if (result[0].type === "render" && result[0].block.cockpit_render === "layout") {
        expect(result[0].block.direction).toBe("column");
      }
    });

    it("handles text + metric_cards + timeline mixed content", () => {
      const metrics = {
        cockpit_render: "metric_cards",
        metrics: [{ label: "Revenue", value: "$50k" }],
      };
      const timeline = {
        cockpit_render: "timeline",
        events: [{ time: "today", title: "Launch" }],
      };
      const input = [
        "Here's your overview:",
        "",
        "```json",
        JSON.stringify(metrics),
        "```",
        "",
        "And the timeline:",
        "",
        "```json",
        JSON.stringify(timeline),
        "```",
      ].join("\n");

      const result = parseResponse(input);
      expect(result).toHaveLength(4);
      expect(result[0].type).toBe("text");
      expect(result[1].type).toBe("render");
      expect(result[2].type).toBe("text");
      expect(result[3].type).toBe("render");
      if (result[1].type === "render") expect(result[1].block.cockpit_render).toBe("metric_cards");
      if (result[3].type === "render") expect(result[3].block.cockpit_render).toBe("timeline");
    });

    it("handles kanban with empty columns gracefully", () => {
      const block = {
        cockpit_render: "kanban",
        columns: [
          { name: "Empty", cards: [] },
        ],
      };
      const input = ["```json", JSON.stringify(block), "```"].join("\n");
      const result = parseResponse(input);

      expect(result).toHaveLength(1);
      if (result[0].type === "render" && result[0].block.cockpit_render === "kanban") {
        expect(result[0].block.columns[0].cards).toHaveLength(0);
      }
    });

    it("handles metric_cards without optional fields", () => {
      const block = {
        cockpit_render: "metric_cards",
        metrics: [{ label: "Count", value: "42" }],
      };
      const input = ["```json", JSON.stringify(block), "```"].join("\n");
      const result = parseResponse(input);

      expect(result).toHaveLength(1);
      if (result[0].type === "render" && result[0].block.cockpit_render === "metric_cards") {
        expect(result[0].block.metrics[0].change).toBeUndefined();
        expect(result[0].block.metrics[0].period).toBeUndefined();
      }
    });

    it("handles timeline without optional fields", () => {
      const block = {
        cockpit_render: "timeline",
        events: [{ time: "now", title: "Something happened" }],
      };
      const input = ["```json", JSON.stringify(block), "```"].join("\n");
      const result = parseResponse(input);

      expect(result).toHaveLength(1);
      if (result[0].type === "render" && result[0].block.cockpit_render === "timeline") {
        expect(result[0].block.events[0].description).toBeUndefined();
        expect(result[0].block.events[0].status).toBeUndefined();
      }
    });

    it("handles incomplete layout block while streaming", () => {
      const input = [
        "Building dashboard:",
        "",
        "```json",
        '{"cockpit_render": "layout", "direction": "row", "blocks": [{"cockpit_ren',
      ].join("\n");

      const result = parseResponse(input);
      expect(result.some((s) => s.type === "loading")).toBe(true);
      expect(result.some((s) => s.type === "text" && s.content === "Building dashboard:")).toBe(true);
    });
  });

  // ── Basic inputs ───────────────────────────────────────────────────
  describe("basic inputs", () => {
    it("handles empty string", () => {
      const result = parseResponse("");
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("text");
    });

    it("handles plain text", () => {
      const result = parseResponse("Hello, world!");
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("text");
      if (result[0].type === "text") {
        expect(result[0].content).toBe("Hello, world!");
      }
    });
  });
});
