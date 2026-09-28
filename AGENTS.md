# AGENTS.md

## Purpose

This file is the operational guide for AI coding agents working in this repository.

Keep the working context minimal. Do not read large parts of the repository unless the task requires it.

Prefer local discovery over global exploration.

For project-specific context (what this service does, real architecture, hard rules, known bugs), see `CLAUDE.md` — read it first, always.

---

## Stack

- Runtime: Node.js 20
- Language: TypeScript
- HTTP framework: Express (`v2/`, current production) and Fastify (`v3/`, new)
- Validation: Zod (`v3/` only — `v2/` has none)
- Databases: Firebird (ERP, read-mostly) and PostgreSQL (`user_settings`, `push_subscriptions`)
- Package manager: npm

---

## Repository Structure

```text
src/
├── core/           # Business logic and integrations, framework-agnostic
├── v2/             # Express API — production surface, NEVER edit (see CLAUDE.md)
├── v3/             # Fastify + Zod API, feature-first modules
│   ├── health/
│   ├── tag/
│   ├── cie/
│   └── shared/     # Truly cross-cutting only: response envelope, service-proxy
├── scripts/        # One-off scripts
└── server.ts       # Entry point

docs/                          # workspace root, shared across all 4 projects
└── PADRAO-RESPOSTA-V3.md      # v3 response envelope, service auth, folder convention

AI-Friendly Architecture Specification.md   # workspace root — architectural rationale
```

Do not load `docs/PADRAO-RESPOSTA-V3.md` or the architecture spec unless the task touches `v3/`.

---

## Context Strategy

For every task, minimize the amount of unrelated context loaded.

Use this discovery order:

1. Read `CLAUDE.md` (project context, hard rules).
2. Identify whether the task is `core/`, `v2/`, or `v3/`.
3. Inspect files inside that area.
4. Check whether the module contains its own `AGENTS.md` (rare — only for modules with non-obvious protocol/security context).
5. Read `docs/PADRAO-RESPOSTA-V3.md` only when the task touches `v3/`.
6. Use repository-wide search when local discovery is insufficient.

Do not explore the entire repository by default.

---

## Core Architecture Rules

### Feature Locality

Inside `v3/`, keep feature-specific code inside its own folder:

```text
v3/
└── tag/
    ├── tag.routes.ts
    └── tag.schema.ts
```

Do not distribute a `v3/` feature across `routes/`, `controllers/`, `schemas/` global folders — that pattern was tried and reverted (see git history of `refactor(v3): reorganiza estrutura por feature`).

### Cohesion

Keep related code together. Separate code when responsibilities differ, not merely because a pattern allows another file.

Do not optimize for minimum file count. Do not create unnecessary files merely to keep files small.

### Progressive Complexity

Start with the simplest structure that correctly represents the domain. `v3/` began as `routes/` + `lib/` and was reorganized to feature folders only once there was enough real code to justify it — that same discipline applies to future growth.

### Boundaries

- `core/` never imports Express or anything from `v2/`.
- `v3/shared/` holds only what is genuinely cross-cutting (response envelope, generic service proxy) — feature-specific logic stays in its feature folder.
- `v2/` is the production surface. **Never edit it** — see the hard rule in `CLAUDE.md`.

### Abstractions

Do not create interfaces, factories, or wrappers without concrete value (multiple implementations, external boundary, test substitution). `v3/shared/service-proxy.ts` exists because it is called from two different features (`tag/`, `cie/`) with the same authentication pattern — that is the bar for extracting something to `shared/`.

---

## Shared Code

`v3/shared/` is reserved for code genuinely shared across `v3/` features. Before moving code there, verify it is used by two or more features. A schema used by only one route stays inside that route's folder (`<feature>.schema.ts`), not in `shared/`.

Do not use `lib/` or `utils/` as generic dumping grounds — this project moved away from that pattern deliberately.

---

## Naming

Prefer `<feature>.routes.ts`, `<feature>.schema.ts` inside `v3/`. Avoid vague names like `manager.ts`, `helper.ts`, `utils.ts` when a more specific name is possible.

---

## Scope Discipline

Keep changes focused on the requested task. Do not perform unrelated refactoring, rename unrelated files, or modify `v2/` as a side effect of a `v3/` change.

---

## Validation

Before considering a change complete, run:

```bash
npx tsc --noEmit   # type check
npm run build      # full compile
```

There is no lint or automated test suite configured in this project yet. Manual functional validation (local run, or against the real server via VPN) is the current practice — state explicitly which validation was performed.

---

## Dependencies

Before adding a new dependency, verify the requirement cannot reasonably be implemented with what is already installed. Prefer established, maintained libraries. Avoid dependencies for trivial functionality.

---

## Comments

Comments explain **why**, not **what**. The codebase already documents several non-obvious causes (env var read timing, MSYS path conversion, Postgres locale) as comments near the affected code — follow that pattern for new non-obvious constraints.

---

## Error Handling

- Never hardcode credentials, log secrets, or log tokens.
- `v3/` error responses (401/403) are generic ("Não autorizado.") — never name the internal mechanism (env var, token name) in a response that could be publicly visible via Swagger.
- Never expose stack traces to clients in production.

---

## Security

Treat all external input as untrusted. Validate inputs at system boundaries (Zod in `v3/`).

`v2/` has no user authentication yet — this is tracked and intentional (see `CLAUDE.md` and the workspace checklist), not something to silently "fix" as part of another task.

---

## Before Creating a New File

Ask:

1. Does this represent a distinct responsibility?
2. Could it remain coherently with existing code in the same feature folder?
3. Does separation improve context locality?
4. Am I creating this only because a pattern traditionally uses another file?

---

## Before Completing a Task

Verify:

- the requested behavior is implemented;
- `v2/` was not touched;
- `npx tsc --noEmit` passes;
- `npm run build` passes;
- CHANGELOG.md was updated (see the `commit` skill for the full flow);
- documentation was updated when `v3/` structure or the response envelope changed.

---

## Primary Principle

When choosing between two implementations, prefer the one that allows a future developer or agent to understand and modify the feature while loading the least amount of unrelated context.

> Keep related code together.
> Preserve meaningful boundaries.
> Prefer explicit, simple structures.
> Load context progressively.
> Optimize for relevant context, not minimum file count.
