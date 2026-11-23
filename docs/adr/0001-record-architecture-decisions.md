# 0001. Record architecture decisions

- Status: Accepted
- Date: 2026-11-22

## Context

The product grows feature by feature, with most code written by AI agents and reviewed by an orchestrator.
Decisions need to be discoverable and their reasons preserved.

## Decision

Significant decisions are recorded as ADRs in `docs/adr/`, numbered sequentially, using
`0000-template.md`. ADRs are immutable once accepted; changing a decision means a new ADR that
supersedes the old one. The `AGENTS.md` files point to the ADRs that bind each area.

## Consequences

Contributors read ADRs instead of reverse-engineering intent. Every PR that changes a convention
must add or supersede an ADR.
