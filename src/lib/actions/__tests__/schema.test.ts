import { describe, expect, it } from "vitest";
import {
  buildActionPromptSection,
  isValidActionType,
  validateActionParams,
} from "../schema";

describe("action schema", () => {
  it("validates action types", () => {
    expect(isValidActionType("linear_create_issue")).toBe(true);
    expect(isValidActionType("missing")).toBe(false);
  });

  it("rejects missing required params", () => {
    expect(validateActionParams("slack_send_message", { channel: "general" })).toEqual({
      ok: false,
      message: "Missing required param: text",
    });
  });

  it("rejects invalid param types", () => {
    expect(validateActionParams("github_comment_pr", {
      owner: "mio",
      repo: "coworker",
      pull_number: "12",
      body: "Looks good",
    })).toEqual({
      ok: false,
      message: "Invalid param pull_number: expected number",
    });
  });

  it("accepts valid params", () => {
    expect(validateActionParams("calendar_create_event", {
      summary: "Planning",
      start: "2026-06-28T10:00:00Z",
      end: "2026-06-28T10:30:00Z",
      attendees: ["art@example.com"],
    })).toEqual({ ok: true });
  });

  it("does not advertise direct Gmail send in the prompt", () => {
    const prompt = buildActionPromptSection();
    expect(prompt).toContain("gmail_draft");
    expect(prompt).not.toContain("gmail_send");
  });
});
