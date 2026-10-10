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
- Day/week navigation, workout templates, editable workouts, sets, weight, reps, RPE, completion and rest timer.
- Copy a workout to next week; exercise library and custom exercises.
- Daily calories/macros/water and weekly overview; configurable personal goals.
- Sleep times/score, stress, caffeine, night awakenings, reading, steps and morning habits.
- Bodyweight/waist history, charts, personal maxima and training volume.
- Local progress photos and side-by-side comparison; private cloud storage upload once connected.
- Record backup import/export. **Photo files are not included in the JSON record backup yet.** Retain original photos until full media backup is implemented.
- Supabase email-link authentication and account-scoped offline queue; per-field merge, optimistic revision checks and deletion tombstones.

## Separate Supabase setup

1. Create a **new** development project, preferably an EU region. Leave the current live project alone.
2. Apply `supabase/migrations/202610100001_initial.sql` to the new project. Local tests execute the migration on PostgreSQL via PGlite and check RLS/CAS/storage ownership.
3. Copy `.env.example` to `.env`; fill the **new** project's URL and public publishable key. Never put service-role keys, management tokens or DB passwords in the frontend.
4. Set Auth Site URL/allowed redirects to the actual development preview URL and localhost. Configure email delivery before public testing.
5. Restart Vite. Log in with the same account on PC and mobile **in this new app**. Demo data does not automatically enter real accounts.
6. Confirm record and photo round trips across two signed-in devices, offline recovery, deletion, sign-out and account switching before inviting testers.

No new remote Supabase database has been created or connected as part of the initial local build. The deployment owner must supply the connection through their Supabase account.

## Structure

`src/App.tsx` contains the initial product screens. `src/lib/model.ts` defines record merge rules; `repository.ts` persists isolated account stores; `sync.ts` connects to Supabase. `src/components/ProgressPhotos.tsx` handles photos. The SQL migration enforces per-user access, and writes go through an authenticated CAS function. `tests/responsive.html` is a development-only iframe fixture for mobile layout checks.

Use `VITE_BASE_PATH=/become-better-next/` for a subpath deployment. A private repository does not automatically provide a public GitHub Pages website; choose an independent development host before enabling mobile access.

## Before a commercial release

Track remaining work in [docs/product-roadmap.md](docs/product-roadmap.md). Current limitations include no billing/native-store distribution/community, no automatic legacy-data migration, no full media backup, no crash telemetry, and no service-worker/offline page loading. Records saved while the page is open remain available locally; reopening from the network requires connectivity.
