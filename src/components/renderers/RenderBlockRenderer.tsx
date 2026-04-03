"use client";

import type { RenderBlock } from "@/lib/parser";
import { RenderTable } from "./Table";
import { RenderBarChart } from "./BarChart";
import { RenderCardGrid } from "./CardGrid";
import { RenderMermaid } from "./Mermaid";
import { RenderLayout } from "./Layout";

export function RenderBlockRenderer({
  block,
  onItemClick,
}: {
  block: RenderBlock;
  onItemClick?: (source: string, data: any) => void;
}) {
  switch (block.cockpit_render) {
    case "table":
      return (
        <RenderTable
          title={block.title}
          columns={block.columns}
          rows={block.rows}
          onRowClick={
            onItemClick
              ? (rowIndex, row) =>
                  onItemClick("table", {
                    title: block.title,
                    columns: block.columns,
                    rowIndex,
                    row,
                  })
              : undefined
          }
        />
      );
    case "bar_chart":
      return (
        <RenderBarChart
          title={block.title}
          data={block.data}
          onBarClick={
            onItemClick
              ? (barIndex, item) =>
                  onItemClick("bar_chart", {
                    title: block.title,
                    barIndex,
                    ...item,
                  })
              : undefined
          }
        />
      );
    case "card_grid":
      return (
        <RenderCardGrid
          title={block.title}
          cards={block.cards}
          onCardClick={
            onItemClick
              ? (cardIndex, card) =>
                  onItemClick("card_grid", {
                    title: block.title,
                    cardIndex,
                    ...card,
                  })
              : undefined
          }
        />
      );
    case "mermaid":
      return <RenderMermaid title={block.title} code={block.code} />;
    case "layout":
      return (
        <RenderLayout
          direction={block.direction}
          children={block.children}
          onItemClick={onItemClick}
        />
      );
    default:
      return null;
  }
}
