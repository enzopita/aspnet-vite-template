import "@/styles/index.css";

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";

import { activateLocale, DEFAULT_LOCALE } from "@/lib/i18n/locales";

import { createAppQueryClient } from "./app/query-client";
import { createAppRouter } from "./app/router";

const queryClient = createAppQueryClient();
const router = createAppRouter(queryClient);

async function bootstrap() {
  await activateLocale(DEFAULT_LOCALE);

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element #root was not found.");
  }

  createRoot(rootElement).render(
    <StrictMode>
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
          <Toaster position="bottom-right" />
        </QueryClientProvider>
      </I18nProvider>
    </StrictMode>,
  );
}

void bootstrap();
