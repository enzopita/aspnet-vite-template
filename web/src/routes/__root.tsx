import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";

const primaryNavLabel = msg`Navegação principal`;

interface RootContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RootContext>()({
  component: RootLayout,
});

function RootLayout() {
  const { i18n } = useLingui();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link to="/catalog" className="text-base font-semibold tracking-tight text-foreground">
            App
          </Link>
          <nav aria-label={i18n._(primaryNavLabel)} className="flex items-center gap-4 text-sm">
            <Link
              to="/catalog"
              className="text-muted-foreground transition-colors duration-fast hover:text-foreground [&.active]:font-medium [&.active]:text-foreground"
            >
              <Trans>Catálogo</Trans>
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
