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

- Responsive monochrome dashboard, dark by default with an optional light appearance; separated card surfaces, readable labels/fields, desktop sidebar and mobile bottom navigation. Daily actions have direct shortcuts; the workout overview has one primary action and nutrition puts the entry form before the weekly budget.
- Account-scoped training/nutrition/recovery/progress switches. Disabled trackers disappear from navigation and dashboard metrics while their saved records remain intact.
- Password sign-in, registration, email confirmation handling and password recovery/update forms. Real account actions require the separate Supabase project to be connected; the UI says so explicitly until then.
- Route/dialog transitions, synchronization indicators, client-loading placeholders and reduced-motion support. Disabled buttons have a stable cursor; the invitation action opens sign-in when anonymous.
- Day/week navigation, personal workouts, sets, weight, reps, completion and rest timer. RPE is optional and hidden initially.
- Write an exercise name directly in the workout, rename it in place, reuse past names and track maxima for personal names. Templates and the exercise library are optional.
- Copy a workout to next week.
- Move exercises up/down with arrows, including completed workouts. Reordering preserves exercise/set identities, renumbers the list and saves locally in one operation before cloud sync.
- Optional daily step totals from an iPhone Shortcut: Huawei Health can share steps with Apple Health, then a user-configured Shortcut sends a total to a dedicated write-only endpoint. Keys are owner-created, hashed server-side, expire after a year and can be revoked immediately. Steps do not overwrite calories, sleep or notes; repeated totals are idempotent and deleted days are not revived. There is no direct native HealthKit reader or Huawei OAuth integration in this web app, and a real phone setup/transfer still needs verification. See [docs/iphone-steps.md](docs/iphone-steps.md).
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
2. For an empty **new project**, apply SQL migrations in filename order: `202610100001_initial.sql`, `202610110001_coaching_and_albums.sql`, `202610110002_planning_and_phases.sql`, then `202610140001_health_steps.sql`. Never rerun the initial migrations on a populated database. Local tests execute them on PostgreSQL via PGlite, including accepted invitations, chat isolation, photo/management consent, trainer goal CAS, atomic workout creation, step-key isolation and revocation checks.
3. Copy `.env.example` to `.env`; fill the **new** project's URL and public publishable key. Never put service-role keys, management tokens or DB passwords in the frontend.
4. Enable email/password signup; retain email confirmation, and set Auth Site URL/allowed redirects to the independent HTTPS app URL plus `http://127.0.0.1:5174` for local development. Configure email delivery before real registration/recovery testing.
5. Restart Vite. Log in with the same account on PC and mobile **in this new app**. Demo data does not automatically enter real accounts.
6. Confirm record and photo round trips across two signed-in devices, offline recovery, deletion, sign-out and account switching before inviting testers. Test a trainer, two clients and a second trainer in the real project too; SQL tests do not replace hosted integration tests.

The independent project `pilfcwraxpsuqssfvvjm` is connected through public build variables. The initial three migrations were applied atomically in its Dashboard SQL editor on 2026-10-13; the additive step-connection migration was applied on 2026-10-14. Do not blindly rerun them. Hosted checks confirmed RLS, no anonymous table read grants, private photo storage, and a real confirmed account with a successful sign-in and a saved record. Anonymous record/connection reads fail (401); an invalid step key fails (400). Full PC/phone round-trip and hosted coaching/media/Shortcut checks still need completion.

Email signup and confirmation remain enabled. Custom SMTP is not configured: Supabase's built-in mail service is limited to project-team email addresses, so general registrations and recovery for friends need a separate SMTP sender. Do not disable email verification to work around this; trainer invitations depend on the verified email identity.

See [docs/coaching.md](docs/coaching.md) for trainer/client access and the invitation workflow. The prepared online chat refreshes every 10 seconds while this screen is visible. It has no push notifications or automatic invitation emails yet.

## Structure

`src/App.tsx` contains the initial product screens. `src/lib/model.ts` defines record merge rules; `repository.ts` persists isolated account stores; `sync.ts` connects to Supabase. `src/components/ProgressPhotos.tsx` handles photos. The SQL migration enforces per-user access, and writes go through an authenticated CAS function. `tests/responsive.html` is a development-only iframe fixture for mobile layout checks.

Use `VITE_BASE_PATH=/become-better-next/` for a subpath deployment. A private repository does not automatically provide a public GitHub Pages website; choose an independent development host before enabling mobile access.

The source repository is `https://github.com/pokornydavid/become-better-next`, now public at the owner's request to use the same GitHub Pages setup as the old app. A transfer to the owner's `dpokornydev` account has been requested and still needs acceptance. Its current Pages address is `https://pokornydavid.github.io/become-better-next/`; update links and Auth redirects after any accepted ownership transfer.

The Pages workflow is opt-in through `DEPLOY_GITHUB_PAGES=true`. Set repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` together for the **new** project to activate account actions. Without both cloud variables it publishes only the explicitly labeled demo; it does not enable login or device sync. It tests and builds before deploying, rejects the old production project and refuses secret/service-role keys. Making the source public does not put runtime records, photos or ignored environment files in the repository.

## Before a commercial release

Track remaining work in [docs/product-roadmap.md](docs/product-roadmap.md). Current limitations include no billing/native-store distribution/community, no full media backup, no crash telemetry and no hosted two-account/device verification. Offline page loading is prepared in production builds; fresh sign-in and expired-session recovery require internet access.
