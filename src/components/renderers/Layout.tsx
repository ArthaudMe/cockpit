"use client";

import type { RenderBlock } from "@/lib/parser";
import { RenderTable } from "./Table";
import { RenderBarChart } from "./BarChart";
import { RenderCardGrid } from "./CardGrid";
import { RenderMetricCards } from "./MetricCard";
import { RenderTimeline } from "./Timeline";
import { RenderKanban } from "./Kanban";

function RenderBlockComponent({ block }: { block: RenderBlock }) {
  switch (block.cockpit_render) {
    case "table":
      return <RenderTable title={block.title} columns={block.columns} rows={block.rows} />;
    case "bar_chart":
      return <RenderBarChart title={block.title} data={block.data} />;
    case "card_grid":
      return <RenderCardGrid title={block.title} cards={block.cards} />;
    case "metric_cards":
      return <RenderMetricCards title={block.title} metrics={block.metrics} />;
    case "timeline":
      return <RenderTimeline title={block.title} events={block.events} />;
    case "kanban":
      return <RenderKanban title={block.title} columns={block.columns} />;
    default:
      return null;
  }
}

export function RenderLayout({
  title,
  direction,
  blocks,
}: {
  title?: string;
  direction: "row" | "column";
  blocks: RenderBlock[];
}) {
  return (
    <div style={{ margin: "0.4rem 0" }}>
      {title && (
        <div
          style={{
            fontSize: "0.6rem",
            fontWeight: 600,
            color: "var(--text-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "0.35rem",
          }}
        >
          {title}
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexDirection: direction,
          gap: "0.35rem",
        }}
      >
        {blocks.map((block, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0 }}>
            <RenderBlockComponent block={block} />
          </div>
        ))}
      </div>
    </div>
  );
}
