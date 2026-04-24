"use client";

import { useEffect, type ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { initAnalytics, track } from "@/lib/analytics";

function GlobalErrorListener({ children }: { children: ReactNode }) {
  useEffect(() => {
    initAnalytics();

    const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
      const message =
        e.reason instanceof Error ? e.reason.message : String(e.reason);
      track("app_error", {
        errorType: "unhandledRejection",
        message: message.slice(0, 1000),
        stack:
          e.reason instanceof Error
            ? e.reason.stack?.slice(0, 1000)
            : undefined,
        context: "browser",
      });
      console.error("[unhandledRejection]", e.reason);
    };

    const handleError = (e: ErrorEvent) => {
      track("app_error", {
        errorType: "uncaughtError",
        message: e.message?.slice(0, 1000),
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        context: "browser",
      });
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleError);
    return () => {
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
      window.removeEventListener("error", handleError);
    };
  }, []);

  return <>{children}</>;
}

export function ClientShell({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <GlobalErrorListener>{children}</GlobalErrorListener>
    </ErrorBoundary>
  );
}
