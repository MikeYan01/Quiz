# Issue tracker: Local Markdown

Issues and specs for this repository live as Markdown files under `.scratch/`. This directory is ephemeral: never commit or push it, and remove a completed feature directory after implementation.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- Feature spec: `.scratch/<feature-slug>/spec.md`
- Implementation issues: one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`
- Record triage state with a `Status:` line near the top of specs and issue files.
- Append discussion under a `## Comments` heading.

## Skill operations

- "Publish to the issue tracker": create the appropriate file under `.scratch/<feature-slug>/`.
- "Fetch the relevant ticket": read the referenced local Markdown file.

## Wayfinding

- Map: `.scratch/<effort>/map.md`
- Child ticket: `.scratch/<effort>/issues/NN-<slug>.md`
- Record `Type: research|prototype|grilling|task` and `Status: open|claimed|resolved` near the top.
- Record blockers as `Blocked by: NN, NN`; a ticket is unblocked when every listed ticket is resolved.
- Claim a ticket by setting `Status: claimed` before work.
- Resolve it by appending `## Answer`, setting `Status: resolved`, and updating the map's Decisions-so-far.
