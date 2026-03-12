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
import { OnboardingView } from "@/components/views/OnboardingView";
import {
  focusCalendarEvent,
  focusMetric,
  focusSlackMessage,
  focusCompetitor,
  focusTodo,
  focusProject,
  focusProjectLinear,
  focusProjectGitHub,
  focusProjectSlack,
  focusMeeting,
  focusPerson,
} from "@/lib/focus";

type CenterView =
  | { type: "chat" }
  | { type: "project"; index: number }
  | { type: "focus"; focus: ContextFocus };

export default function Home() {
  const [chatInput, setChatInput] = useState("");
  const [centerView, setCenterView] = useState<CenterView>({ type: "chat" });
  const [claudeStatus, setClaudeStatus] = useState<{
    connected: boolean;
    version?: string;
    checking: boolean;
  }>({ connected: false, checking: true });

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

  // Context column click handlers
  const handleCalendarClick = useCallback((index: number) => {
    handleOpenFocus(focusCalendarEvent(contextData.calendar[index]));
  }, [handleOpenFocus]);

  const handleMetricClick = useCallback((key: string) => {
    const metric = contextData.usage_analytics[key as keyof typeof contextData.usage_analytics];
    handleOpenFocus(focusMetric(key, metric));
  }, [handleOpenFocus]);

  const handleSlackClick = useCallback((index: number) => {
    handleOpenFocus(focusSlackMessage(contextData.slack_highlights[index]));
  }, [handleOpenFocus]);

  const handleCompetitorClick = useCallback((index: number) => {
    handleOpenFocus(focusCompetitor(contextData.competitor_updates[index]));
  }, [handleOpenFocus]);

  const handleTodoClick = useCallback((index: number) => {
    handleOpenFocus(focusTodo(contextData.todos[index]));
  }, [handleOpenFocus]);

  // Project view sub-item click handlers
  const handleProjectFocus = useCallback((focus: ContextFocus) => {
    setCenterView({ type: "focus", focus });
  }, []);

  const selectedProjectIndex = centerView.type === "project" ? centerView.index : null;
  const selectedProject = selectedProjectIndex !== null
    ? contextData.projects[selectedProjectIndex]
    : null;

  // Show onboarding if Claude CLI is not connected (and we're done checking)
  if (!claudeStatus.checking && !claudeStatus.connected) {
    return (
      <OnboardingView
        onRetry={handleRetryConnection}
        checking={claudeStatus.checking}
        error="not_connected"
      />
    );
  }

  // Show loading while checking connection
  if (claudeStatus.checking) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "var(--bg)",
          gap: "0.5rem",
        }}
      >
        <span
          className="dot"
          style={{ background: "var(--accent)", animation: "pulse 1.5s ease-in-out infinite" }}
        />
        <span style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>
          Connecting to Claude Code...
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--bg)" }}>
      <Header
        claudeStatus={claudeStatus}
        onRetryConnection={handleRetryConnection}
      />
      <div className="flex flex-1 overflow-hidden" style={{ padding: "0.5rem", gap: "0.5rem" }}>
        <div style={{ width: 280, minWidth: 240, flexShrink: 0 }} className="overflow-y-auto">
          <ProjectsColumn
            projects={contextData.projects}
            onPrefill={handlePrefill}
            onProjectClick={handleProjectClick}
            selectedIndex={selectedProjectIndex}
          />
          <FeedColumn
            feed={contextData.company_feed}
            onOpenFocus={handleOpenFocus}
          />
        </div>
        <div className="flex-1 min-w-0">
          {centerView.type === "focus" ? (
            <ContextualChatView
              focus={centerView.focus}
              onBack={handleBackToChat}
              claudeConnected={claudeStatus.connected}
            />
          ) : selectedProject ? (
            <ProjectView
              project={selectedProject as any}
              onBack={handleBackToChat}
              onPrefill={handlePrefill}
              onOpenFocus={handleProjectFocus}
            />
          ) : (
            <ChatColumn
              context={contextData}
              inputValue={chatInput}
              onInputChange={setChatInput}
              claudeConnected={claudeStatus.connected}
            />
          )}
        </div>
        <div style={{ width: 300, minWidth: 260, flexShrink: 0 }} className="overflow-y-auto">
          <ContextColumn
            context={contextData}
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
