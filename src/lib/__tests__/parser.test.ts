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

  // ── Skill proposal blocks ──────────────────────────────────────────
  describe("skill proposals", () => {
    it("parses a cockpit_skill create block", () => {
      const input = [
        "I'll save that as a skill:",
        "```json",
        JSON.stringify({
          cockpit_skill: true,
          action: "create",
          name: "Weekly Report",
          slash: "/report",
          icon: "◎",
          description: "Generate a weekly progress report",
          promptInstruction: "Summarize all projects for the week...",
          triggerHints: ["report", "weekly"],
        }),
        "```",
      ].join("\n");

      const result = parseResponse(input);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("text");
      expect(result[1].type).toBe("skill_proposal");
      if (result[1].type === "skill_proposal") {
        expect(result[1].proposal.name).toBe("Weekly Report");
        expect(result[1].proposal.slash).toBe("/report");
        expect(result[1].proposal.action).toBe("create");
      }
    });

    it("parses a cockpit_skill delete block", () => {
      const input = [
        "```json",
        JSON.stringify({
          cockpit_skill: true,
          action: "delete",
          id: "custom-weekly-report",
          name: "Weekly Report",
        }),
        "```",
      ].join("\n");

      const result = parseResponse(input);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("skill_proposal");
      if (result[0].type === "skill_proposal") {
        expect(result[0].proposal.action).toBe("delete");
        expect(result[0].proposal.id).toBe("custom-weekly-report");
      }
    });
  });

  // ── Regression: fence close without preceding newline (bug 1) ───────
  describe("fence close without preceding newline", () => {
    it("parses a render block whose fence has no leading newline", () => {
      const input =
        '```json\n{"cockpit_render":"table","columns":["A"],"rows":[["1"]]}```';
      const result = parseResponse(input);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("render");
      if (result[0].type === "render") {
        expect(result[0].block.cockpit_render).toBe("table");
        if (result[0].block.cockpit_render === "table") {
          expect(result[0].block.columns).toEqual(["A"]);
          expect(result[0].block.rows).toEqual([["1"]]);
        }
      }
    });
  });

  // ── Regression: lone cockpit_memory block (bug 2) ───────────────────
  describe("lone cockpit_memory block", () => {
    it("does not render the raw JSON of a stripped memory block", () => {
      const input = [
        "```json",
        JSON.stringify({ cockpit_memory: "remember this" }),
        "```",
      ].join("\n");

      const result = parseResponse(input);
      expect(result).toHaveLength(0);
      expect(result.some((s) => s.type === "text")).toBe(false);
    });

    it("still returns a text segment for genuinely plain text", () => {
      const result = parseResponse("Just some plain text.");
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("text");
      if (result[0].type === "text") {
        expect(result[0].content).toBe("Just some plain text.");
      }
    });
  });

  // ── Regression: unclosed fence on finalized message (bug 3) ─────────
  describe("unclosed fence with final option", () => {
    it("shows loading by default (mid-stream)", () => {
      const input = ["Working...", "", "```json", '{"cockpit_render":"tab'].join("\n");
      const result = parseResponse(input);
      expect(result.some((s) => s.type === "loading")).toBe(true);
    });

    it("degrades to text when final is true", () => {
      const input = ["Working...", "", "```json", '{"cockpit_render":"tab'].join("\n");
      const result = parseResponse(input, { final: true });
      expect(result.some((s) => s.type === "loading")).toBe(false);
      expect(result.some((s) => s.type === "text" && s.content === "Working...")).toBe(true);
      expect(result.some((s) => s.type === "text" && s.content.includes("cockpit_render"))).toBe(true);
    });
  });

  // ── Regression: skill tag with hyphen (bug 4) ───────────────────────
  describe("skill tag with hyphen", () => {
    it("recognizes and strips a hyphenated skill slug", () => {
      const result = parseResponse("[skill: /weekly-report]\nHello");

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("skill_active");
      if (result[0].type === "skill_active") {
        expect(result[0].skillSlash).toBe("/weekly-report");
      }
      expect(result[1].type).toBe("text");
      if (result[1].type === "text") {
        expect(result[1].content).toBe("Hello");
      }
    });
  });
});
