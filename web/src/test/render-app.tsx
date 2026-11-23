import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "vitest-browser-react";

import { createAppRouter } from "@/app/router";

import { createTestQueryClient } from "./render";

/**
 * The whole app at `path`, as the browser would load it: real routes and guards, the API mocked by MSW. For tests of
 * flows across pages; a component on its own uses `renderWithProviders`. Reference: `src/app/router.test.tsx`.
 */
export async function renderApp(path: string) {
  const queryClient = createTestQueryClient();
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
  const screen = await render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nProvider>,
  );
  return { screen, router, queryClient };
}
