# Become Better

Independent next-generation fitness app. **Beta foundation**; hosted account/device verification remains required before switching daily use from the old app.

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

- Responsive monochrome dashboard, dark by default with an optional light appearance; desktop sidebar and mobile bottom navigation.
- Account-scoped training/nutrition/recovery/progress switches. Disabled trackers disappear from navigation and dashboard metrics while their saved records remain intact.
- Password sign-in, registration, email confirmation handling and password recovery/update forms. Real account actions require the separate Supabase project to be connected; the UI says so explicitly until then.
- Route/dialog transitions, synchronization indicators, client-loading placeholders and reduced-motion support. Disabled buttons have a stable cursor; the invitation action opens sign-in when anonymous.
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
- Record backup import/export with a review before importing, plus a converter for the old `fit-plan` JSON backup: personally named exercises/sets, daily nutrition/recovery, measurements, library and phase folders. Historical calorie targets are retained. Embedded JPEG/PNG/WebP files are imported to the new local media store; old cloud URLs/credentials are never copied or fetched. Photos represented only by old cloud references require their original files. **New JSON exports still exclude binary photo files.**
- Cardio duration, speed and incline fields, preserving their meaning during import. Cardio is excluded from strength volume and personal weight maxima. A workout cannot be completed without a recorded completed set.
- Build-generated static service worker, update notice and install prompt when supported. Only bundled same-origin files are cached; authentication callbacks, query strings, writes and backend API responses are excluded. Login/synchronization require connectivity. Vite development intentionally does not register a worker.
- Account-scoped offline queue with Supabase synchronization, per-field merge, optimistic revision checks and deletion tombstones.

## Separate Supabase setup

1. Create a **new** development project, preferably an EU region. Leave the current live project alone.
2. Apply all three SQL migrations in filename order to the **new project**: `202610100001_initial.sql`, `202610110001_coaching_and_albums.sql`, then `202610110002_planning_and_phases.sql`. Local tests execute them on PostgreSQL via PGlite, including accepted invitations, chat isolation, photo/management consent, trainer goal CAS, atomic workout creation and revocation checks.
3. Copy `.env.example` to `.env`; fill the **new** project's URL and public publishable key. Never put service-role keys, management tokens or DB passwords in the frontend.
4. Enable email/password signup; retain email confirmation, and set Auth Site URL/allowed redirects to the independent HTTPS app URL plus `http://127.0.0.1:5174` for local development. Configure email delivery before real registration/recovery testing.
5. Restart Vite. Log in with the same account on PC and mobile **in this new app**. Demo data does not automatically enter real accounts.
6. Confirm record and photo round trips across two signed-in devices, offline recovery, deletion, sign-out and account switching before inviting testers. Test a trainer, two clients and a second trainer in the real project too; SQL tests do not replace hosted integration tests.

No new remote Supabase database is connected yet. Connect the Supabase plugin/account so the isolated project and real auth/device flows can be configured and verified. Do not substitute the old production project.

See [docs/coaching.md](docs/coaching.md) for trainer/client access and the invitation workflow. The prepared online chat refreshes every 10 seconds while this screen is visible. It has no push notifications or automatic invitation emails yet.

## Structure

`src/App.tsx` contains the initial product screens. `src/lib/model.ts` defines record merge rules; `repository.ts` persists isolated account stores; `sync.ts` connects to Supabase. `src/components/ProgressPhotos.tsx` handles photos. The SQL migration enforces per-user access, and writes go through an authenticated CAS function. `tests/responsive.html` is a development-only iframe fixture for mobile layout checks.

Use `VITE_BASE_PATH=/become-better-next/` for a subpath deployment. A private repository does not automatically provide a public GitHub Pages website; choose an independent development host before enabling mobile access.

## Before a commercial release

Track remaining work in [docs/product-roadmap.md](docs/product-roadmap.md). Current limitations include no billing/native-store distribution/community, no full media backup, no crash telemetry and no hosted two-account/device verification. Offline page loading is prepared in production builds; fresh sign-in and expired-session recovery require internet access.
