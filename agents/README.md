# Agent Docs

This directory is the system of record for agent-facing repo guidance.

## Recommended Reading Order

1. `../AGENTS.md`
2. `architecture/overview.md`
3. The task-specific page for the area being changed

## Layout

- `architecture/` - Process model and major ownership boundaries.
- `conventions/` - Coding contracts for recurring patterns.
- `risky-areas/` - Places where incorrect changes are expensive.
- `workflows/` - Task-oriented procedures for validation and release.

## Maintenance Rules

- Prefer one page per concrete topic.
- Keep volatile counts out unless they are cheap to verify.
- Link to source paths rather than duplicating implementation details.
- Update the narrowest relevant page when behavior or setup changes.
