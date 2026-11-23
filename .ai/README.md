# `.ai/` — AI working material

Everything here is written for and by AI agents working on this repository (and
for the humans steering them). Project source code never lives here.

## Layout

| Folder | Purpose |
|--------|---------|
| [`plan/`](plan/) | Plans: proposals, designs and implementation plans. See [`plan/README.md`](plan/README.md). |
| [`docs/`](docs/) | Development documentation of the code as it is. **The cornerstone is [`docs/code-structure.md`](docs/code-structure.md)**, updated after every step. See [`docs/README.md`](docs/README.md). |

[`handoff.md`](handoff.md) is the session handoff: where the work stands, for
the next AI session. Update it when handing off.

More folders will be added as needs appear.

## Conventions

- **One topic per file**, Markdown, short descriptive kebab-case names, no dates
  in filenames (git history has the dates).
- **Each folder gets a `README.md`** that says what belongs there and how files
  in it are structured. Add the folder to the table above in the same change.
- **Cite sources.** When a document relies on XMLUI behavior, link the file in
  `/Users/dotneteer/source/xmlui` it came from.
- **Keep documents current.** A stale document misleads more than a missing one.
  When work changes what a document says, update it or mark it superseded.
