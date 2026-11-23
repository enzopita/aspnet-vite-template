# 0006. Internationalization

- Status: Accepted
- Date: 2026-11-22

## Decision

- Source locale **pt-BR**; **en** always complete.
- Frontend: **Lingui** (ICU MessageFormat, extraction from source, compiled catalogs). `scripts/check-i18n.mjs`
  fails when a catalog is incomplete.
- Backend: the stable error `code` is never localized; the frontend maps codes to messages.
- Numbers and dates are formatted with `Intl`, never by string concatenation.
