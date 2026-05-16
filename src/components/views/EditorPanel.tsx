"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@monaco-editor/react").then(m => m.default), {
  ssr: false,
  loading: () => <div style={{ padding: "1rem", color: "var(--text-muted)", fontSize: "0.6rem" }}>Loading editor...</div>,
});

type OnMount = import("@monaco-editor/react").OnMount;

export interface OpenFile {
  path: string;
  content: string;
  language: string;
  dirty: boolean;
}

export function EditorPanel({
  files,
  activeIndex,
  onActivate,
  onClose,
  onCloseAll,
  onChange,
  onSaved,
}: {
  files: OpenFile[];
  activeIndex: number;
  onActivate: (index: number) => void;
  onClose: (index: number) => void;
  onCloseAll: () => void;
  onChange: (index: number, content: string) => void;
  onSaved: (index: number) => void;
}) {
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const active = files[activeIndex];

  const handleSave = useCallback(async () => {
    if (!active || !active.dirty) return;
    setSaving(true);
    try {
      const res = await fetch("/api/files", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: active.path, content: active.content }),
      });
      if (res.ok) {
        onSaved(activeIndex);
      }
    } catch {
      // silently fail
    }
    setSaving(false);
  }, [active, activeIndex, onSaved]);

  // Cmd+S handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const basename = (p: string) => p.split("/").pop() || p;

  if (!active) return null;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
          minHeight: "1.8rem",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", flex: 1, overflowX: "auto", gap: 0 }}>
          {files.map((file, i) => (
            <button
              key={file.path}
              onClick={() => onActivate(i)}
              style={{
                background: i === activeIndex ? "var(--surface)" : "transparent",
                border: "none",
                borderRight: "1px solid var(--border)",
                padding: "0.3rem 0.5rem",
                fontSize: "0.75rem",
                fontWeight: i === activeIndex ? 600 : 400,
                color: i === activeIndex ? "var(--text)" : "var(--text-dim)",
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
                whiteSpace: "nowrap",
                transition: "all 0.1s",
              }}
            >
              {file.dirty && (
                <span style={{ color: "var(--accent)", fontSize: "0.75rem", lineHeight: 1 }}>
                  &bull;
                </span>
              )}
              {basename(file.path)}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(i);
                }}
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  marginLeft: "0.15rem",
                  opacity: 0.5,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
              >
                x
              </span>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.15rem", padding: "0 0.4rem", flexShrink: 0 }}>
          {saving && (
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Saving...
            </span>
          )}
          <button
            onClick={onCloseAll}
            style={{
              background: "none",
              border: "none",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontFamily: "inherit",
              padding: "0.15rem 0.3rem",
            }}
            title="Close all"
          >
            Close all
          </button>
        </div>
      </div>

      {/* File path breadcrumb */}
      <div
        style={{
          padding: "0.2rem 0.5rem",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          borderBottom: "1px solid var(--border)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {active.path}
      </div>

      {/* Monaco Editor */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Editor
          key={active.path}
          defaultValue={active.content}
          language={active.language}
          theme="vs-dark"
          onMount={handleEditorMount}
          onChange={(value) => {
            if (value !== undefined) {
              onChange(activeIndex, value);
            }
          }}
          options={{
            fontSize: 12,
            fontFamily: "'SF Mono', Monaco, Inconsolata, 'Fira Code', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            lineNumbers: "on",
            renderLineHighlight: "line",
            padding: { top: 8 },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollbar: {
              verticalScrollbarSize: 6,
              horizontalScrollbarSize: 6,
            },
          }}
        />
      </div>
    </div>
  );
}
