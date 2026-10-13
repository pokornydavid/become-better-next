# Product direction

Become Better combines training, nutrition, recovery and measurable progress. Visual direction: black, white, strong typography, clear hierarchy and fast logging on a phone. It has its own identity rather than reusing another app's artwork or branding.

## Development foundation — delivered

Separate private repository; React/TypeScript; monochrome responsive UI; working personal logs and photos; prepared independent Supabase schema and synchronization; record/account/security regression tests.

Personal exercise naming is the default workflow, with optional RPE and library/templates. Dark appearance, account-scoped tracker switches, auth forms and loading states are implemented. Visible weekly calorie budgets show saved targets and distribute remaining intake. Diet/bulk phases create dated photo folders and preserve photos when their dates or length change. Photo folders support comparison editing and PNG export. A reviewed legacy-backup converter retains exercises/sets, daily records, measurements, library, phase folders and embedded photos without using the old database. Cardio units remain distinct from strength metrics. Build-generated static caching and update/install UI are prepared. Coaching includes teams, clients, staff notes, text instructions, chat, consented goal editing and structured workout assignment with SQL permissions. Online use is still pending a new hosted Supabase connection and independent HTTPS deployment.

## Next milestone — private beta

- Connect a new Supabase project and deploy a separate HTTPS preview.
- Verify two-device synchronization against that real project, including photos and auth expiration.
- Complete onboarding for goals, units, experience level and schedule.
- Expand training planning: saved user templates, exercise reordering, warm-up/drop sets, cardio and timed exercises.
- Add folder date editing, optimized cloud thumbnails, full media backups, undo, reliable deletion/purge and account-data export/removal.
- Finish hosted coaching verification, editing/removing assigned plans, chat notifications/history paging, invitation delivery/cancellation and full collaboration exports.
- Expand workout completion validation, history editing and accessible larger-text settings.
- Add complete binary media backups/exports, plus an optional file-assisted migration for photos stored only in the old cloud project.
- Split initial screen modules, add browser end-to-end tests and error monitoring.
- Verify installation, static cache updates and offline/relogin behavior on real Android/iOS devices against the deployed app.

## Commercial launch

- Choose pricing, audience and plan contents; validate with real beta users.
- Add subscriptions through a server-side billing integration. Entitlements must be checked server-side.
- Create terms, privacy notice, consent and retention controls; EU user-data handling and backups.
- Add support, transactional email delivery, monitoring, rate limits and abuse protection.
- Decide PWA versus native wrappers/app-store apps; test real Android/iOS devices.
- Run a launch review covering auth, per-account isolation, offline conflict resolution, payments and restore procedures.

## Production isolation

The old application continues on its current URL and database. The new app must always have a different deployment, database, storage namespace and repo. Sharing or migration requires an explicit user action. Never point experimental code at the old database.
