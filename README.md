# Become Better

Independent next-generation fitness app. **Development version 0.1**, not a commercial release.

This repository is separate from the live `fit-plan-local` app. Do not deploy it to that app's URL, copy its credentials, or run these migrations in its database. The frontend explicitly rejects the existing production Supabase project reference.

## Run

Node.js 24 or newer:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5174/. No backend is needed to try the clearly labeled local demo. Fonts and UI assets are bundled, with no external font requests.

```sh
npm test
npm run build
npm run preview
```

## Implemented

- Responsive monochrome dashboard, desktop sidebar and mobile bottom navigation.
- Day/week navigation, personal workouts, sets, weight, reps, completion and rest timer. RPE is optional and hidden initially.
- Write an exercise name directly in the workout, rename it in place, reuse past names and track maxima for personal names. Templates and the exercise library are optional.
- Copy a workout to next week.
- Daily calories/macros/water, visible daily targets and an independent weekly calorie budget. The remaining budget is distributed across all unlogged days, including gaps in earlier days; recorded zero counts as a logged day.
- Sleep times/score, stress, caffeine, night awakenings, reading, steps and morning habits.
- Bodyweight/waist history, charts, personal maxima and training volume.
- Named weekly photo folders, batch upload (up to 30 photos, 10 MB each), ordering, captions and moving photos between folders. Folder images load as they become visible.
- Diet/bulk/maintenance/custom progress phases with a start date, 1–52 weeks, written goal and optional target weight. All weekly folders are created atomically; phase length/date edits preserve photo identities and refuse to discard populated later weeks. Past phases and independent folders remain accessible.
- Compare the same photo positions across weeks; zoom, drag, rotation, brightness, contrast, overlay, saved non-destructive edits and side-by-side PNG export. Original files are retained.
- Trainer teams with multiple coaches, accepted client invitations, shared client logs, staff-only notes, text instructions and a client/team chat. A separate client consent permits trainers to change allowlisted goals and add structured workouts with personal exercise names and planned sets to the client's diary. Goal writes enforce revision checks; completed logs remain owner-written. The local demonstration is explicitly labeled and never sends real messages.
- Record backup import/export. **Photo files are not included in the JSON record backup yet.** Retain original photos until full media backup is implemented.
- Supabase email-link authentication and account-scoped offline queue; per-field merge, optimistic revision checks and deletion tombstones.

## Separate Supabase setup

1. Create a **new** development project, preferably an EU region. Leave the current live project alone.
2. Apply all three SQL migrations in filename order to the **new project**: `202610100001_initial.sql`, `202610110001_coaching_and_albums.sql`, then `202610110002_planning_and_phases.sql`. Local tests execute them on PostgreSQL via PGlite, including accepted invitations, chat isolation, photo/management consent, trainer goal CAS, atomic workout creation and revocation checks.
3. Copy `.env.example` to `.env`; fill the **new** project's URL and public publishable key. Never put service-role keys, management tokens or DB passwords in the frontend.
4. Set Auth Site URL/allowed redirects to the actual development preview URL and localhost. Configure email delivery before public testing.
5. Restart Vite. Log in with the same account on PC and mobile **in this new app**. Demo data does not automatically enter real accounts.
6. Confirm record and photo round trips across two signed-in devices, offline recovery, deletion, sign-out and account switching before inviting testers. Test a trainer, two clients and a second trainer in the real project too; SQL tests do not replace hosted integration tests.

No new remote Supabase database has been created or connected as part of the initial local build. The deployment owner must supply the connection through their Supabase account.

See [docs/coaching.md](docs/coaching.md) for trainer/client access and the invitation workflow. The prepared online chat refreshes every 10 seconds while this screen is visible. It has no push notifications or automatic invitation emails yet.

## Structure

`src/App.tsx` contains the initial product screens. `src/lib/model.ts` defines record merge rules; `repository.ts` persists isolated account stores; `sync.ts` connects to Supabase. `src/components/ProgressPhotos.tsx` handles photos. The SQL migration enforces per-user access, and writes go through an authenticated CAS function. `tests/responsive.html` is a development-only iframe fixture for mobile layout checks.

Use `VITE_BASE_PATH=/become-better-next/` for a subpath deployment. A private repository does not automatically provide a public GitHub Pages website; choose an independent development host before enabling mobile access.

## Before a commercial release

Track remaining work in [docs/product-roadmap.md](docs/product-roadmap.md). Current limitations include no billing/native-store distribution/community, no automatic legacy-data migration, no full media backup, no crash telemetry, and no service-worker/offline page loading. Records saved while the page is open remain available locally; reopening from the network requires connectivity.
