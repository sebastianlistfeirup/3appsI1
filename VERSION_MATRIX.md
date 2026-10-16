# Verified version matrix

Recorded from the working environment and lockfile on 2026-10-16. Exact dependencies are locked in `pnpm-lock.yaml`; `pnpm install --frozen-lockfile` is the reproducible entry point.

| Component                    | Version        | Actual use                                                    |
| ---------------------------- | -------------- | ------------------------------------------------------------- |
| Node.js                      | 24.19.0        | Runtime, builds, tests, worker                                |
| pnpm                         | 11.25.0        | Monorepo package manager                                      |
| Next.js                      | 16.4.2         | Three independent App Router applications                     |
| React / React DOM            | 19.3.1         | Client editors and persistence hooks                          |
| TypeScript                   | 5.9.3          | Strict typechecks                                             |
| Vitest                       | 5.0.5          | Domain and real-database fixtures                             |
| Playwright                   | 1.64.1         | Chromium, Firefox and WebKit browser journeys                 |
| axe / Playwright integration | 4.11.1         | WCAG 2 A/AA and 2.1 AA automated checks                       |
| PostgreSQL                   | 17.10          | Isolated integration database, real RLS/transactions          |
| pg-boss                      | 12.38.0        | Durable queue in a separate schema                            |
| jose                         | 6.2.12         | Asymmetric JWT signature/claim verification                   |
| Zod                          | 4.6.7          | Runtime data and import validation                            |
| Three.js                     | 0.186.1        | Real 3D viewport and frame capture                            |
| React Flow                   | 12.12.0        | Editable process graph                                        |
| pdf-lib / fontkit            | 1.17.1 / 1.1.1 | Real PDFs with embedded licensed fonts                        |
| fflate                       | 0.8.3          | Portable verified project archives                            |
| idb                          | 8.0.4          | IndexedDB transactions                                        |
| FFmpeg / ffprobe             | 7.1.5          | Verified local H.264/AAC export, frame count and audio checks |

The local OS is Debian 13 x64. Browser executables are installed by Playwright; The default Chromium is the pinned Playwright build; an alternative is used only when `PLAYWRIGHT_CHROMIUM_EXECUTABLE` is explicitly set. Firefox and WebKit were actually launched and tested. The development container required unprivileged library extraction for WebKit; this workaround is described in the Studio checkpoint. CI installs dependencies using Playwright's standard `--with-deps` flow instead.

Hosted Supabase, live providers, Stripe and a production supervisor have no verified connection/version in this delivery. Package availability does not establish an operational integration.
