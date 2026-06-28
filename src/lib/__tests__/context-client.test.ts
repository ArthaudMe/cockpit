import { afterEach, describe, expect, it, vi } from "vitest";
import { buildContextFromLiveData } from "../context-client";

describe("buildContextFromLiveData", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("derives stable feed ids and absolute time context", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-28T12:00:00Z"));

    const first = buildContextFromLiveData({
      githubPRs: [
        {
          title: "Ship onboarding",
          repo: "mio/cockpit",
          author: "art",
          status: "open",
          time: "2026-06-28T11:30:00Z",
          url: "https://github.com/mio/cockpit/pull/1",
        },
      ],
      slackMessages: [
        {
          channel: "#product",
          author: "Nina",
          message: "Decision: keep the right panel compact",
          time: "2h ago",
        },
      ],
    });
    const second = buildContextFromLiveData({
      githubPRs: [
        {
          title: "Ship onboarding",
          repo: "mio/cockpit",
          author: "art",
          status: "open",
          time: "2026-06-28T11:30:00Z",
          url: "https://github.com/mio/cockpit/pull/1",
        },
      ],
      slackMessages: [
        {
          channel: "#product",
          author: "Nina",
          message: "Decision: keep the right panel compact",
          time: "2h ago",
        },
      ],
    });

    expect(first.company_feed.map((item) => item.id)).toEqual(
      second.company_feed.map((item) => item.id),
    );
    expect(first.company_feed[0].event).toContain("Ship onboarding");
    expect(first.company_feed[0].occurredAt).toBe("2026-06-28T11:30:00.000Z");
    expect(first.company_feed[0].timeContext).toContain("Today");
    expect(first.company_feed[1].occurredAt).toBe("2026-06-28T10:00:00.000Z");
  });

  it("prioritizes same-day calendar items before later future days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-28T10:00:00Z"));

    const context = buildContextFromLiveData({
      calendar: [
        {
          title: "Next week planning",
          date: "2026-07-02",
          time: "9:00 AM",
          duration: "30m",
          attendees: ["Maya"],
          source: "Google Calendar",
        },
        {
          title: "Today's customer call",
          date: "2026-06-28",
          time: "11:00 AM",
          duration: "30m",
          attendees: ["Rae"],
          source: "Google Calendar",
        },
      ],
    });

    expect(context.company_feed[0].event).toBe("Today's customer call");
    expect(context.company_feed[0].timeContext).toContain("Today");
  });
});
