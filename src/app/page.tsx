"use client";

import { useState, useCallback, useEffect } from "react";
import contextData from "../../context.json";
import { Header } from "@/components/layout/Header";
import { ProjectsColumn } from "@/components/columns/ProjectsColumn";
import { FeedColumn } from "@/components/columns/FeedColumn";
import { ContextColumn } from "@/components/columns/ContextColumn";
import { ChatColumn } from "@/components/columns/ChatColumn";
import { ProjectView } from "@/components/views/ProjectView";
import { ContextualChatView, type ContextFocus } from "@/components/views/ContextualChatView";
import { AlertsView } from "@/components/views/AlertsView";
import { BriefingView } from "@/components/views/BriefingView";
import {
  focusCalendarEvent,
  focusMetric,
  focusSlackMessage,
  focusCompetitor,
  focusTodo,
  focusProject,
} from "@/lib/focus";

type Context = typeof contextData;

type CenterView =
  | { type: "chat" }
  | { type: "project"; index: number }
  | { type: "focus"; focus: ContextFocus }
  | { type: "alerts" }
  | { type: "briefings" };

export default function Home() {
  const [chatInput, setChatInput] = useState("");
  const [centerView, setCenterView] = useState<CenterView>({ type: "chat" });
  const [liveContext, setLiveContext] = useState<Context>(contextData);
  const [claudeStatus, setClaudeStatus] = useState<{
    connected: boolean;
    version?: string;
    checking: boolean;
  }>({ connected: false, checking: true });

  // Check Claude CLI status
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data) => {
        setClaudeStatus({
          connected: data.connected,
          version: data.version,
          checking: false,
        });
      })
      .catch(() => {
        setClaudeStatus({ connected: false, checking: false });
      });
  }, []);

  // Fetch live context (from connectors or fallback to static)
  useEffect(() => {
    fetch("/api/context")
      .then((r) => r.json())
      .then((data) => {
        if (data.context) {
          setLiveContext(data.context);
        }
      })
      .catch(() => {
        // Keep static context
      });

    // Poll every 5 minutes for live data
    const interval = setInterval(() => {
      fetch("/api/context")
        .then((r) => r.json())
        .then((data) => {
          if (data.context) {
            setLiveContext(data.context);
          }
        })
        .catch(() => {});
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
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
      })
      .catch(() => {
        setClaudeStatus({ connected: false, checking: false });
      });
  }, []);

  const handleProjectClick = useCallback((index: number) => {
    setCenterView({ type: "project", index });
  }, []);

  const handleBackToChat = useCallback(() => {
    setCenterView({ type: "chat" });
  }, []);

  const handleOpenFocus = useCallback((focus: ContextFocus) => {
    setCenterView({ type: "focus", focus });
  }, []);

  const handleOpenAlerts = useCallback(() => {
    setCenterView({ type: "alerts" });
  }, []);

  const handleOpenBriefings = useCallback(() => {
    setCenterView({ type: "briefings" });
  }, []);

  const handleOpenSettings = useCallback(() => {
    window.location.href = "/settings";
  }, []);

  // Context column click handlers
  const handleCalendarClick = useCallback((index: number) => {
    handleOpenFocus(focusCalendarEvent(liveContext.calendar[index]));
  }, [handleOpenFocus, liveContext.calendar]);

  const handleMetricClick = useCallback((key: string) => {
    const metric = liveContext.usage_analytics[key as keyof typeof liveContext.usage_analytics];
    handleOpenFocus(focusMetric(key, metric));
  }, [handleOpenFocus, liveContext.usage_analytics]);

  const handleSlackClick = useCallback((index: number) => {
    handleOpenFocus(focusSlackMessage(liveContext.slack_highlights[index]));
  }, [handleOpenFocus, liveContext.slack_highlights]);

  const handleCompetitorClick = useCallback((index: number) => {
    handleOpenFocus(focusCompetitor(liveContext.competitor_updates[index]));
  }, [handleOpenFocus, liveContext.competitor_updates]);

  const handleTodoClick = useCallback((index: number) => {
    handleOpenFocus(focusTodo(liveContext.todos[index]));
  }, [handleOpenFocus, liveContext.todos]);

  // Project view sub-item click handlers
  const handleProjectFocus = useCallback((focus: ContextFocus) => {
    setCenterView({ type: "focus", focus });
  }, []);

  const selectedProjectIndex = centerView.type === "project" ? centerView.index : null;
  const selectedProject = selectedProjectIndex !== null
    ? liveContext.projects[selectedProjectIndex]
    : null;

  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--bg)" }}>
      <Header
        claudeStatus={claudeStatus}
        onRetryConnection={handleRetryConnection}
        onAlertsClick={handleOpenAlerts}
        onBriefingsClick={handleOpenBriefings}
        onSettingsClick={handleOpenSettings}
      />
      <div className="flex flex-1 overflow-hidden" style={{ padding: "0.5rem", gap: "0.5rem" }}>
        <div style={{ width: 280, minWidth: 240, flexShrink: 0 }} className="overflow-y-auto">
          <ProjectsColumn
            projects={liveContext.projects}
            onPrefill={handlePrefill}
            onProjectClick={handleProjectClick}
            selectedIndex={selectedProjectIndex}
          />
          <FeedColumn
            feed={liveContext.company_feed}
            onOpenFocus={handleOpenFocus}
          />
        </div>
        <div className="flex-1 min-w-0">
          {centerView.type === "alerts" ? (
            <AlertsView onClose={handleBackToChat} />
          ) : centerView.type === "briefings" ? (
            <BriefingView onClose={handleBackToChat} />
          ) : centerView.type === "focus" ? (
            <ContextualChatView
              focus={centerView.focus}
              onBack={handleBackToChat}
              claudeConnected={claudeStatus.connected}
            />
          ) : selectedProject ? (
            <ProjectView
              project={selectedProject as Parameters<typeof ProjectView>[0]["project"]}
              onBack={handleBackToChat}
              onPrefill={handlePrefill}
              onOpenFocus={handleProjectFocus}
            />
          ) : (
            <ChatColumn
              context={liveContext}
              inputValue={chatInput}
              onInputChange={setChatInput}
              claudeConnected={claudeStatus.connected}
            />
          )}
        </div>
        <div style={{ width: 300, minWidth: 260, flexShrink: 0 }} className="overflow-y-auto">
          <ContextColumn
            context={liveContext}
            onPrefill={handlePrefill}
            onCalendarClick={handleCalendarClick}
            onMetricClick={handleMetricClick}
            onSlackClick={handleSlackClick}
            onCompetitorClick={handleCompetitorClick}
            onTodoClick={handleTodoClick}
          />
        </div>
      </div>
    </div>
  );
}
