import "@/styles/index.css";

import { afterAll, afterEach, beforeAll } from "vitest";

import { activateLocale } from "@/lib/i18n/locales";

import { worker } from "./msw";
import { settleTestQueryClients } from "./render";

// Without the View Transitions API the router navigates without one (the app enables `defaultViewTransition`).
// Transitions in headless Chromium inside Vitest's iframe crash the browser connection, and they only animate.
Reflect.deleteProperty(Document.prototype, "startViewTransition");

// Messages render in pt-BR, the source locale, so tests assert the text a person actually sees.
beforeAll(async () => {
  await activateLocale("pt-BR");
  await worker.start({ quiet: true, onUnhandledFrame: "error" });
});

afterEach(async () => {
  // Requests a test started finish against that test's handlers, never the next test's.
  await settleTestQueryClients();
  worker.resetHandlers();
  localStorage.clear();
});

afterAll(async () => {
  await worker.stop();
});
