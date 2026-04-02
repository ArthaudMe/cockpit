"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export function QuickOpen({
  cwd,
  onOpenFile,
  onClose,
}: {
  cwd: string;
  onOpenFile: (path: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const search = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const params = new URLSearchParams({ q, cwd });
          const res = await fetch(`/api/files/search?${params}`);
          const data = await res.json();
          setResults(data.files || []);
          setSelected(0);
        } catch {
          setResults([]);
        }
        setLoading(false);
      }, 150);
    },
    [cwd]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    search(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((p) => Math.min(p + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((p) => Math.max(p - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const file = results[selected];
      if (file) {
        onOpenFile(file);
        onClose();
      }
    }
  };

  const relativePath = (abs: string) => {
    if (abs.startsWith(cwd + "/")) return abs.slice(cwd.length + 1);
    return abs;
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        paddingTop: "15vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 500,
          maxWidth: "90vw",
          background: "var(--surface)",
          border: "1px solid var(--border-light)",
          borderRadius: 8,
          boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
          overflow: "hidden",
          alignSelf: "flex-start",
        }}
      >
        <div style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search files..."
            style={{
              width: "100%",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "0.4rem 0.6rem",
              fontSize: "0.7rem",
              color: "var(--text)",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
        </div>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {loading && results.length === 0 && (
            <div style={{ padding: "0.6rem", fontSize: "0.55rem", color: "var(--text-muted)", textAlign: "center" }}>
              Searching...
            </div>
          )}
          {!loading && results.length === 0 && query && (
            <div style={{ padding: "0.6rem", fontSize: "0.55rem", color: "var(--text-muted)", textAlign: "center" }}>
              No files found
            </div>
          )}
          {results.map((file, i) => (
            <button
              key={file}
              onClick={() => {
                onOpenFile(file);
                onClose();
              }}
              onMouseEnter={() => setSelected(i)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.35rem 0.6rem",
                background: i === selected ? "rgba(255,255,255,0.06)" : "transparent",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: "0.5rem", opacity: 0.5 }}>&#9634;</span>
              <span style={{ fontSize: "0.6rem", color: "var(--text)" }}>
                {relativePath(file)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
