# Plans

A plan is written **before** non-trivial work so the user can review it, and
updated **during** the work so it stays accurate afterwards.

## Naming

`<short-descriptive-topic>.md`, kebab-case, no dates or numbers — e.g.
`expression-parser.md`, `choose-tech-stack.md`.

## Status

Every plan starts with a status line, one of:

- `Draft` — being written or discussed; not approved.
- `Accepted` — approved by the user; work may start.
- `In progress` — being implemented; the steps checklist shows how far.
- `Done` — implemented. Keep the file; it records why things are the way they are.
- `Superseded by <file>` — replaced by another plan.
- `Rejected` — kept so that the same idea isn't proposed again without new reasons.

Only the user moves a plan from `Draft` to `Accepted`.

## Template

```markdown
# <Title>

**Status:** Draft

## Goal
What this achieves, and why now. One or two paragraphs.

## Background
What exists today, here and in XMLUI (cite paths under
/Users/dotneteer/source/xmlui). Constraints.

## Options considered          <!-- omit when there is only one sensible path -->
Each option with its trade-offs; the chosen one and why.

## Design
The approach in enough detail to implement and review it.
Call out every deliberate divergence from XMLUI behavior.

## Steps
- [ ] Small, verifiable steps, each ending in a working state.

## Verification
How we'll know it works: tests, examples, manual checks.

## Open questions
Decisions that are the user's to make.
```

When a plan is accepted and contains an architectural decision, add a one-line
entry under *Decisions* in the root `AGENTS.md` that links to the plan.
