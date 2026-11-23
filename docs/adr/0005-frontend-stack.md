# 0005. Frontend stack and structure

- Status: Accepted
- Date: 2026-11-22

## Decision

- **Vite SPA**, React with the React Compiler, **TypeScript 7** in strict mode. Served by `App.Api` in production
  (same origin as the API).
- **TanStack Router** (file-based, typed search params), **Query**, **Form** (Zod via Standard Schema), **Table**.
- **shadcn/ui** on Base UI primitives, Tailwind CSS v4; charts with shadcn charts (Recharts).
- Semantic design tokens only (`web/src/styles/tokens.css`), light and dark themes, one motion scale;
  `prefers-reduced-motion` is always honored.
- pnpm. Lint **Oxlint** (type-aware), format **Oxfmt**, **React Doctor**. Tests: Vitest browser mode + Testing
  Library, MSW handlers generated from the contract, Playwright for E2E.
- Structure and import direction live in `web/AGENTS.md`, enforced by Oxlint import rules.
