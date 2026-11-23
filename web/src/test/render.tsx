import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HttpResponse } from "msw";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { render } from "vitest-browser-react";

// Every client a test creates, so the test setup can let their requests finish before the next test starts.
const testQueryClients = new Set<QueryClient>();

/** A query client for one test: no retries, so a mocked failure shows up at once. */
export function createTestQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  testQueryClients.add(queryClient);
  return queryClient;
}

/**
 * Waits until no query or mutation of this test is in flight, then drops its clients. Run after each test (see
 * `setup.ts`): a refetch still running when a test ends would otherwise reach the next test's MSW handlers.
 */
export async function settleTestQueryClients(): Promise<void> {
  const clients = [...testQueryClients];
  testQueryClients.clear();
  await Promise.all(
    clients.map(async (queryClient) => {
      await vi.waitFor(
        () => {
          if (queryClient.isFetching() > 0 || queryClient.isMutating() > 0) {
            throw new Error("requests still in flight");
          }
        },
        { timeout: 5000 },
      );
      queryClient.clear();
    }),
  );
}

/** Renders a component with the app's providers (i18n, TanStack Query), for components that don't need routing. */
export async function renderWithProviders(ui: ReactNode, queryClient = createTestQueryClient()) {
  const screen = await render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </I18nProvider>,
  );
  return { ...screen, queryClient };
}

/** An RFC 9457 problem response with a stable `code` (ADR 0004), for MSW handlers. */
export function problemResponse(status: number, code: string) {
  return HttpResponse.json(
    { type: "about:blank", title: code, status, code },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}
