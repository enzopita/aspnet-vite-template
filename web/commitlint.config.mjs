// Commit message rules for the whole repository (run by lefthook `commit-msg`).
// Conventional Commits, written in English: https://www.conventionalcommits.org
//
//   feat(orders): place an order
//   fix(web): keep the filter when paging
//   docs(adr): record the outbox decision

/** Modules, apps and cross-cutting areas. Extend this list when a new module appears (and say why in the PR). */
const scopes = [
  // backend modules: add one scope per module under src/Modules/
  "catalog",
  // backend shared
  "api",
  "kernel",
  "building-blocks",
  "apphost",
  // frontend
  "web",
  "design-kit",
  "i18n",
  "api-client",
  // repository
  "adr",
  "deps",
  "ci",
  "hooks",
  "repo",
  "agents", // task specs and executor-agent tooling (ADR 0008)
];

/** @type {import("@commitlint/types").UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        // Commit history is English-only. Accented or non-Latin characters in the header are a strong signal of a
        // non-English message (e.g. "configuração"), so they're rejected.
        "header-english": ({ header }) => {
          const ascii = /^[\x20-\x7E]*$/.test(header ?? "");
          return [ascii, "write the commit header in English (ASCII only, no accents)"];
        },
      },
    },
  ],
  rules: {
    "header-english": [2, "always"],
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [2, "always", 100],
    "scope-enum": [2, "always", scopes],
    "scope-case": [2, "always", "kebab-case"],
    "subject-full-stop": [2, "never", "."],
  },
};
