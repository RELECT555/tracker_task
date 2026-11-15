# Personal table appearance implementation plan

**Goal:** Give every user one table appearance across all projects, preserving the current rendering as the resettable basic view.

**Approved scope:** Header button, live appearance panel, colors, row density, text size/wrapping, column visibility/pinning/widths, account persistence, and a complete reset. The user approved implementation on 2026-11-15 and specified global preferences across their projects.

**Architecture:** Shared validated preference snapshot stored on the authenticated User. The web reads by user identity, previews changes immediately, and serializes debounced saves. Scoped table styles override only nondefault choices. Existing plan calculations and project changes are preserved.

**Tech stack:** Existing Next/React, TanStack Query, NestJS, Prisma/PostgreSQL, Zod.

## Tasks

- [x] Add shared strict schema, nullable account field, additive migration, authenticated GET/PUT, and API isolation/validation tests.
- [x] Add appearance panel and theme-aware scoped styling with unchanged base styles.
- [x] Integrate preferences, legacy widths, column visibility, and global view controls into project and overview tables.
- [x] Verify base reset, rapid saves, account/project isolation, failure/retry, reload and a second browser context, focus mode and mobile layout.

## Constraints and review focus

- Keep existing unrelated work intact; store screenshots under ignored output/.
- Preferences are available to all authenticated users and never edit plan data.
- Never save a queued request under a changed login session.
- Avoid losing later edits to older save responses; retain unsaved edits on failure.
- Reset restores baseline colors, sizing, widths, visibility, and pinned title column.
- Custom colors remain subtle tints so light/dark theme semantic text stays readable.

## Verification

- Shared/API/web builds, web TypeScript and targeted ESLint passed.
- 18 API preference tests and live authenticated HTTP checks passed; additive local migration applied.
- Browser scripts for table appearance, role details, and project summary passed using isolated fixtures.
- Appearance coverage includes immediate reload/navigation, retained draft with failed GET/retry, independent column visibility, cross-tab login change, second-browser persistence, complete reset, and desktop/mobile focus handling.
- Light/dark screenshots reviewed under output/. Sampled header, title and close-control contrast passed.

## UI refinement after user review

The settings drawer now groups appearance and columns separately. Six table previews replace simple color swatches; Graphite, Cobalt, Turquoise, Iris and Copper have explicitly authored light/dark headers, epic rows, footers, borders and hover surfaces. The base view and custom color fallback remain compatible with saved preferences. All six schemes passed rendered light/dark contrast checks and the existing preference regression; desktop/mobile views were visually reviewed. The dark off-switch was additionally adjusted and measured at 5.6:1 thumb-to-track contrast.
