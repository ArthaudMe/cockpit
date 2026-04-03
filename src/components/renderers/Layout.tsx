"use client";

import type { RenderBlock } from "@/lib/parser";
import { RenderBlockRenderer } from "./RenderBlockRenderer";

export function RenderLayout({
  direction,
  children,
  onItemClick,
}: {
  direction: "row" | "column";
  children: RenderBlock[];
  onItemClick?: (source: string, data: any) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: direction,
        gap: "0.5rem",
        margin: "0.4rem 0",
      }}
    >
      {children.map((child, i) => (
        <div
          key={i}
          style={direction === "row" ? { flex: 1, minWidth: 0 } : undefined}
        >
          <RenderBlockRenderer block={child} onItemClick={onItemClick} />
        </div>
      ))}
    </div>
  );
}
