"use client";

import { useState, useCallback, useEffect } from "react";
import { type Context, buildContextFromLiveData } from "@/lib/context-client";
import type { DatasourceData } from "@/lib/datasources/types";
import { Header } from "@/components/layout/Header";
import { ProjectsColumn } from "@/components/columns/ProjectsColumn";
import { FeedColumn } from "@/components/columns/FeedColumn";
import { ContextColumn } from "@/components/columns/ContextColumn";
import { ChatColumn } from "@/components/columns/ChatColumn";
import { ContextualChatView, type ContextFocus } from "@/components/views/ContextualChatView";
import { OnboardingView } from "@/components/views/OnboardingView";
import { SettingsView } from "@/components/views/SettingsView";
import { EditorPanel, type OpenFile } from "@/components/views/EditorPanel";
import { QuickOpen } from "@/components/ui/QuickOpen";
import {
  focusCalendarEvent,
  focusMetric,
  focusSlackMessage,
  focusCompetitor,
  focusTodo,
  focusMeeting,
} from "@/lib/focus";

type CenterView =
  | { type: "chat" }
  | { type: "focus"; focus: ContextFocus }
  | { type: "settings" };

const EMPTY_CONTEXT: Context = {
  user: "User",
  projects: [],
  calendar: [],
  usage_analytics: {},
  slack_highlights: [],
  competitor_updates: [],
  todos: [],
  company_feed: [],
  connected: {},
};

export default function Home() {
  const [chatInput, setChatInput] = useState("");
  const [centerView, setCenterView] = useState<CenterView>({ type: "chat" });
  const [claudeStatus, setClaudeStatus] = useState<{
    connected: boolean;
    version?: string;
    checking: boolean;
  }>({ connected: false, checking: true });
  const [contextData, setContextData] = useState<Context>(EMPTY_CONTEXT);
  const [inferredProjects, setInferredProjects] = useState<any[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [projectCwd, setProjectCwd] = useState("");

  // Fetch live datasource data
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchLiveData = () => {
      fetch("/api/datasources/data")
        .then((r) => r.json())
        .then((data: DatasourceData) => {
          setContextData(buildContextFromLiveData(data));
        })
        .catch(() => {});
    };

    fetchLiveData();
    interval = setInterval(fetchLiveData, 30_000); // refresh every 30s

    return () => clearInterval(interval);
  }, []);

  // Fetch inferred projects (separate from data poll — cached on server for 5 min)
  const fetchProjects = useCallback((force = false) => {
    setProjectsLoading(true);
    fetch("/api/projects/infer", force ? { method: "POST" } : {})
      .then((r) => r.json())
      .then((data) => {
        if (data.projects) {
          setInferredProjects(data.projects);
        }
      })
      .catch(() => {})
      .finally(() => setProjectsLoading(false));
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data) => {
        setClaudeStatus({
          connected: data.connected,
          version: data.version,
          checking: false,
        });
        if (data.cwd) setProjectCwd(data.cwd);
      })
      .catch(() => {
        setClaudeStatus({ connected: false, checking: false });
      });
  }, []);

  const handlePrefill = useCallback((text: string) => {
    setChatInput(text);
    setCenterView({ type: "chat" });
  }, []);

  const handleRetryConnection = useCallback(() => {
    setClaudeStatus((prev) => ({ ...prev, checking: true }));
    fetch("/api/status")
      .then((r) => r.json())
      .then((data) => {
        setClaudeStatus({
          connected: data.connected,
          version: data.version,
          checking: false,
        });
        if (data.cwd) setProjectCwd(data.cwd);
      })
      .catch(() => {
        setClaudeStatus({ connected: false, checking: false });
      });
  }, []);

  const handleBackToChat = useCallback(() => {
    setCenterView({ type: "chat" });
  }, []);

  const handleSettingsClick = useCallback(() => {
    setCenterView({ type: "settings" });
  }, []);

  const handleOpenFocus = useCallback((focus: ContextFocus) => {
    setCenterView({ type: "focus", focus });
  }, []);

  // Context column click handlers
  const handleCalendarClick = useCallback((index: number) => {
    handleOpenFocus(focusCalendarEvent(contextData.calendar[index]));
  }, [handleOpenFocus, contextData.calendar]);

  const handleMetricClick = useCallback((key: string) => {
    const metric = contextData.usage_analytics[key as keyof typeof contextData.usage_analytics];
    handleOpenFocus(focusMetric(key, metric));
  }, [handleOpenFocus, contextData.usage_analytics]);

  const handleSlackClick = useCallback((index: number) => {
    handleOpenFocus(focusSlackMessage(contextData.slack_highlights[index]));
  }, [handleOpenFocus, contextData.slack_highlights]);

  const handleCompetitorClick = useCallback((index: number) => {
    handleOpenFocus(focusCompetitor(contextData.competitor_updates[index]));
  }, [handleOpenFocus, contextData.competitor_updates]);

  const handleTodoClick = useCallback((index: number) => {
    handleOpenFocus(focusTodo(contextData.todos[index]));
  }, [handleOpenFocus, contextData.todos]);

  // ─── File editor callbacks ──────────────────────────────────────────

  const handleOpenFile = useCallback(async (filePath: string) => {
    // If already open, just switch to it
    const existing = openFiles.findIndex((f) => f.path === filePath);
    if (existing >= 0) {
      setActiveFileIndex(existing);
      return;
    }

    try {
      const params = new URLSearchParams({ path: filePath });
      const res = await fetch(`/api/files?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setOpenFiles((prev) => [
        ...prev,
        { path: data.path, content: data.content, language: data.language, dirty: false },
      ]);
      setActiveFileIndex(openFiles.length); // new tab index
    } catch {
      // silently fail
    }
  }, [openFiles]);

  const handleCloseFile = useCallback((index: number) => {
    setOpenFiles((prev) => prev.filter((_, i) => i !== index));
    setActiveFileIndex((prev) => {
      if (index < prev) return prev - 1;
      if (index === prev) return Math.max(0, prev - 1);
      return prev;
    });
  }, []);

  const handleCloseAllFiles = useCallback(() => {
    setOpenFiles([]);
    setActiveFileIndex(0);
  }, []);

  const handleFileChange = useCallback((index: number, content: string) => {
    setOpenFiles((prev) =>
      prev.map((f, i) =>
        i === index ? { ...f, content, dirty: true } : f
      )
    );
  }, []);

  const handleFileSaved = useCallback((index: number) => {
    setOpenFiles((prev) =>
      prev.map((f, i) =>
        i === index ? { ...f, dirty: false } : f
      )
    );
  }, []);

  // Cmd+P global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        setShowQuickOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Show onboarding if no backends are connected (and we're done checking)
  if (!claudeStatus.checking && !claudeStatus.connected) {
    return (
      <OnboardingView
        onRetry={handleRetryConnection}
        checking={claudeStatus.checking}
      />
    );
  }

  // Show loading while checking connection
  if (claudeStatus.checking) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "var(--bg)",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            border: "1px solid var(--border-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.1rem",
          }}
        >
          &#9670;
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span
            className="dot"
            style={{ background: "var(--accent)", animation: "pulse 1.5s ease-in-out infinite" }}
          />
          <span style={{ fontSize: "0.55rem", color: "var(--text-muted)" }}>
            Connecting...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--bg)" }}>
      <Header
        claudeStatus={claudeStatus}
        onRetryConnection={handleRetryConnection}
        onSettingsClick={handleSettingsClick}
      />
      <div className="flex flex-1 overflow-hidden" style={{ padding: "0.5rem", gap: "0.5rem" }}>
        <div style={{ width: 280, minWidth: 240, flexShrink: 0 }} className="overflow-y-auto">
          <ProjectsColumn
            onPrefill={handlePrefill}
            inferredProjects={inferredProjects}
            inferLoading={projectsLoading}
            onRefresh={() => fetchProjects(true)}
            hasAnyDatasource={Object.values(contextData.connected).some(Boolean)}
            onSettingsClick={handleSettingsClick}
          />
          <FeedColumn
            feed={contextData.company_feed}
            onOpenFocus={handleOpenFocus}
            hasAnyDatasource={Object.values(contextData.connected).some(Boolean)}
            onSettingsClick={handleSettingsClick}
          />
        </div>
        <div className="flex-1 min-w-0">
          {centerView.type === "settings" ? (
            <SettingsView onBack={handleBackToChat} />
          ) : centerView.type === "focus" ? (
            <ContextualChatView
              focus={centerView.focus}
              onBack={handleBackToChat}
              claudeConnected={claudeStatus.connected}
            />
          ) : (
            <ChatColumn
              context={contextData}
              inputValue={chatInput}
              onInputChange={setChatInput}
              claudeConnected={claudeStatus.connected}
              onOpenFile={handleOpenFile}
            />
          )}
        </div>
        <div style={{ width: openFiles.length > 0 ? 500 : 300, minWidth: openFiles.length > 0 ? 400 : 260, flexShrink: 0, transition: "width 0.2s" }} className="overflow-y-auto">
          {openFiles.length > 0 ? (
            <EditorPanel
              files={openFiles}
              activeIndex={activeFileIndex}
              onActivate={setActiveFileIndex}
              onClose={handleCloseFile}
              onCloseAll={handleCloseAllFiles}
              onChange={handleFileChange}
              onSaved={handleFileSaved}
            />
          ) : (
            <ContextColumn
              context={contextData}
              onPrefill={handlePrefill}
              onCalendarClick={handleCalendarClick}
              onMetricClick={handleMetricClick}
              onSlackClick={handleSlackClick}
              onCompetitorClick={handleCompetitorClick}
              onTodoClick={handleTodoClick}
              onSettingsClick={handleSettingsClick}
            />
          )}
        </div>
      </div>

      {/* Quick Open modal (Cmd+P) */}
      {showQuickOpen && (
        <QuickOpen
          cwd={projectCwd}
          onOpenFile={handleOpenFile}
          onClose={() => setShowQuickOpen(false)}
        />
      )}
    </div>
  );
}
