# AGENTS.md — patchfuil

Read this first for any task in this repository. It is the single source of
truth for AI agents; `CLAUDE.md` only imports it.

## What this project is

A **re-invention of the XMLUI framework**: a declarative, reactive UI framework
where applications are written as XML markup (`.xmlui`-style files), with
spreadsheet-like reactive expressions in `{...}` and no manual state wiring.

We are not forking XMLUI. We learn from its design, its documented behavior and
its mistakes, then build a fresh implementation. Where we deliberately diverge
from XMLUI, record the decision and the reason (see *Decisions* below).

## Status

Greenfield; there is no source code yet. React (rendering) and Mantine
(base components) are chosen (see *Decisions*); nothing else is. Do not assume any other part of the
stack (bundler, signals library, etc.) until it is recorded here or in an
accepted plan. When a task depends on such a choice, propose options in a plan
instead of picking silently.

## The reference implementation (read-only)

The original XMLUI lives at `/Users/dotneteer/source/xmlui`.
**Never modify anything there.** Read it freely.

Where to look, in order of usefulness:

| Need | Location (relative to the xmlui repo) |
|------|----------------------------------------|
| What XMLUI *is* from an app developer's view | `.ai/xmlui/overview.md`, `website/content/docs/pages/intro.md`, `markup.md`, `reactive-intro.md` |
| User-facing concepts (markup, scripting, scoping, forms, routing, themes, …) | `website/content/docs/pages/*.md` |
| Concrete, working usage patterns (~220 guides) | `website/content/docs/pages/howto/*.md` |
| Per-component API (props, events, methods, theme vars) | `website/content/docs/reference/components/*.md` |
| Step-by-step tutorial app | `website/content/docs/pages/tutorial-01.md` … `tutorial-12.md` |
| Internals, condensed for AI | `.ai/xmlui/*.md` (start with `mental-model.md`, `rendering-pipeline.md`, `container-state.md`, `expression-eval.md`) |
| Internals, long-form | `xmlui/dev-docs/guide/01-*.md` … (index: `xmlui/dev-docs/guide/index.md`) |
| Actual source | `xmlui/src/` (`components/`, `components-core/`, `parsers/`) |
| Repo-wide agent notes | `AGENTS.md` at the xmlui repo root |

The docs describe **intended behavior**; the source is the ground truth for
**actual behavior**. When they disagree, note it — it is often a spec question
for us to decide.

The XMLUI MCP server (`xmlui_search`, `xmlui_component_docs`,
`xmlui_search_howto`, …) indexes the same material and is a faster way to
search it when connected.

When you cite XMLUI behavior in a plan or discussion, give the file path you
got it from. Don't describe XMLUI from memory.

## The `.ai/` folder

All AI-oriented material for this project lives under `.ai/`. See
[`.ai/README.md`](.ai/README.md) for the layout and its conventions.

- **Plans** go in [`.ai/plan/`](.ai/plan/) and follow
  [`.ai/plan/README.md`](.ai/plan/README.md). When asked to create or record a
  plan, put it there unless the user names another location.

## Decisions

Architectural decisions (stack, divergences from XMLUI, naming) are recorded
here as one line each, with a link to the plan that justified them:

- **Rendering target is React.** Existing React components must be wrappable with lightweight code and usable directly from markup. See [.ai/plan/architecture.md](.ai/plan/architecture.md) § Area 1.
- **Base component library is Mantine.** Its styling is exposed only through XMLUI-style theme variables; Mantine's own theme API is an internal detail. See [.ai/plan/architecture.md](.ai/plan/architecture.md) § "Notes for area 5".

## Working agreements

- Commit only when asked. Don't commit to `master` without being asked; use a branch for larger work.
- Keep this file short. Detail belongs in `.ai/`; link to it from here.
- When you learn something that would change how a future agent works in this
  repo, update this file or the right `.ai/` document instead of saving private memory.
