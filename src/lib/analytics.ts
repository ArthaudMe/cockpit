"use client";

const POSTHOG_KEY = "phc_BSBTh7YoY2nxVPR4atRM88kyzr4AS6x3c9V8SnoE3XRF";
const STORAGE_KEY = "cockpit-analytics-opt-in";

let initialized = false;
let posthogModule: typeof import("posthog-js").default | null = null;

/** Read opt-in state from localStorage. Default: false (opt-in required). */
export function isAnalyticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

/** Set opt-in state and start/stop PostHog accordingly. */
export function setAnalyticsEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, String(enabled));
  if (enabled) {
    initAnalytics();
    posthogModule?.opt_in_capturing();
  } else if (initialized && posthogModule) {
    posthogModule.opt_out_capturing();
  }
}

/** Initialize PostHog (idempotent). Only captures if user has opted in. */
export function initAnalytics() {
  if (typeof window === "undefined") return;
  if (initialized) return;
  if (!isAnalyticsEnabled()) return; // Don't even load the library if not opted in

  initialized = true;

  // Lazy-load posthog only when analytics is enabled
  import("posthog-js").then((mod) => {
    posthogModule = mod.default;
    posthogModule.init(POSTHOG_KEY, {
      api_host: "https://us.i.posthog.com",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      persistence: "localStorage",
      opt_out_capturing_by_default: false,
    });
  });
}

/** Track an event (no-op if not opted in). */
export function track(event: string, properties?: Record<string, unknown>) {
  if (!initialized || !posthogModule || !isAnalyticsEnabled()) return;
  posthogModule.capture(event, properties);
}

/** Identify user (call after profile is loaded). */
export function identifyUser(id: string, properties?: Record<string, unknown>) {
  if (!initialized || !posthogModule || !isAnalyticsEnabled()) return;
  posthogModule.identify(id, properties);
}
