# Product direction

Become Better combines training, nutrition, recovery and measurable progress. Visual direction: black, white, strong typography, clear hierarchy and fast logging on a phone. It has its own identity rather than reusing another app's artwork or branding.

## Development foundation — delivered

Separate private repository; React/TypeScript; monochrome responsive UI; working personal logs and photos; prepared independent Supabase schema and synchronization; record/account/security regression tests.

## Next milestone — private beta

- Connect a new Supabase project and deploy a separate HTTPS preview.
- Verify two-device synchronization against that real project, including photos and auth expiration.
- Complete onboarding for goals, units, experience level and schedule.
- Expand training planning: saved user templates, exercise reordering, warm-up/drop sets, cardio and timed exercises.
- Add photo date/caption editing, media backups, undo, reliable deletion/purge and account-data export/removal.
- Add explicit workout completion validation, history editing and accessible larger-text settings.
- Build optional legacy-backup migration with a preview before importing.
- Split initial screen modules, add browser end-to-end tests and error monitoring.
- Make installable PWA with versioned static cache; keep backend requests out of the service worker.

## Commercial launch

- Choose pricing, audience and plan contents; validate with real beta users.
- Add subscriptions through a server-side billing integration. Entitlements must be checked server-side.
- Create terms, privacy notice, consent and retention controls; EU user-data handling and backups.
- Add support, transactional email delivery, monitoring, rate limits and abuse protection.
- Decide PWA versus native wrappers/app-store apps; test real Android/iOS devices.
- Run a launch review covering auth, per-account isolation, offline conflict resolution, payments and restore procedures.

## Production isolation

The old application continues on its current URL and database. The new app must always have a different deployment, database, storage namespace and repo. Sharing or migration requires an explicit user action. Never point experimental code at the old database.
