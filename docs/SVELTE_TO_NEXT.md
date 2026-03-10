# Svelte → Next.js Dashboard Migration

This note captures the high-level changes involved in replacing the experimental Svelte single-page dashboard with a typed Next.js (App Router) implementation and summarizes how to run or test the new stack.

## What changed

- **Entry point** – The old Svelte route has been replaced with a top-level React page (`app/page.tsx`) that renders a dedicated `DashboardShell` composed of modular components such as the hazard chips, calendar, map, markdown storylines, and stage panels.
- **State management** – Svelte writable stores were ported to a React context provider (`PipelineProvider`) that keeps the selected hazard, pipeline stage, and EM-DAT selection in sync across widgets.
- **Data fetch layer** – API helpers under `app/lib/api` wrap the Django backend endpoints and centralize error handling/response parsing so that the UI components can remain declarative.
- **Visualizations** – The D3 calendar and map that previously lived in `.svelte` files were rewritten as client components. They rely on a shared `useResizeObserver` hook so responsive behavior stays consistent with the original implementation.
- **Styling** – Shared dashboard styles moved into SCSS modules (`app/styles/index.scss` and `app/styles/dashboard.scss`) that extend the existing USWDS theme tokens so the migrated widgets inherit site-wide typography, chips, and card treatments.
- **Assets** – Static data such as `public/ea_adm2.topojson` are now loaded through the Next.js `public/` directory to keep parity with Vercel/Next hosting rules.

## Component mapping

| Svelte feature | Next.js counterpart | Notes |
| --- | --- | --- |
| Page shell + layout | `DashboardShell` | Wraps the page in `PipelineProvider` and lays out the grid + cards. |
| Hazard filter chips | `HazardChips` | Button chips switch the provider state and reset stage selections. |
| Pipeline stage chips | `PipelineChips` | Drives downstream copy/actions and story markdown context. |
| Calendar heatmap | `DisasterCalendar` | Fetches EM-DAT monthly counts on hazard change and draws a responsive heatmap via D3. |
| Region choropleth | `DisasterMap` | Loads Admin2 topojson assets, renders D3/TopoJSON map, and colors features by selected month frequency. |
| Storyline markdown | `MarkdownPanel` | Hydrates markdown fetched per event and renders sanitized HTML snapshots. |
| Stage CTA tiles | `StagePanels` | Replaces conditional Svelte Blocks with React copy/actions bound to provider state. |
| Resize handling | `useResizeObserver` | React hook wrapper around `ResizeObserver` replicates Svelte `bind:clientWidth/Height` responsiveness. |

## How to run the converted Next.js app

1. **Install dependencies**
   ```bash
   yarn install
   ```
2. **Configure environment** – Provide the EM-DAT/CRMA backend endpoint exposed by Django via `.env.local`:
   ```env
   NEXT_PUBLIC_API_BASE_URL="https://your-backend.example.com"
   ```
   The rest of the VEDA UI tokens can stay in `.env` as documented in `docs/CONFIGURATION.md`.
3. **Start the development server**
   ```bash
   yarn dev
   ```
   Visit <http://localhost:3000> to interact with the dashboard.
4. **Build for production**
   ```bash
   yarn build && yarn start
   ```

## Testing & quality gates

| Command | Purpose |
| --- | --- |
| `yarn lint` | Runs Next.js lint rules + TypeScript-aware ESLint config to ensure migrated React components meet project conventions. |
| `yarn ts-check` | Type-checks the new components, hooks, and API clients without emitting JS. |
| `yarn test` | Executes Vitest + Testing Library suites (add tests for the new context/hooks as they are created). |
| `yarn format:check` | Guards the SCSS/TS/MDX formatting rules so the port stays consistent. |

When working against the Django API locally, run both stacks (backend + `yarn dev`) so the EM-DAT fetches, Markdown stories, and CRMA/IBF redirect URLs can resolve successfully.
