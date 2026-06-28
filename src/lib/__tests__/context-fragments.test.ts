import { describe, expect, it } from "vitest";
import { renderContextFragment, renderContextFragments } from "../context-fragments";

describe("context fragments", () => {
  it("renders tagged fragments with titles", () => {
    expect(renderContextFragment({
      tag: "calendar",
      title: "Today's Calendar",
      body: "No calendar events",
    })).toBe('<context tag="calendar" title="Today\'s Calendar">\nNo calendar events\n</context>');
  });

  it("skips empty fragments in groups", () => {
    expect(renderContextFragments([
      { tag: "one", body: "First" },
      { tag: "empty", body: "   " },
      { tag: "two", body: "Second" },
    ])).toBe('<context tag="one">\nFirst\n</context>\n\n<context tag="two">\nSecond\n</context>');
  });
});
