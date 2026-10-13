# Daily-use readiness

The new app is independent of the live v98 app. The old repo, URL and database remain in operation until the owner explicitly chooses to switch.

## Ready in the local beta

Dark/light appearance, tracker switches, personal workouts and cardio, nutrition goals/budgets, recovery, progress phases/photos/comparison, local persistence and backups, reviewed legacy conversion, prepared trainer permissions/workout assignment/chat, and auth forms.

Production builds pre-cache only static app files. Service-worker caches use a content-derived version and their own namespace; old-app caches and backend responses are untouched. In-progress account changes use the existing owner-scoped offline queue. An expired sign-in still needs an online auth refresh.

Legacy conversion reads only a user-selected JSON file. It does not log into, query, modify or copy credentials from production. It preserves personal names, completed/unfinished sets, recorded numeric zero, clock-time semantics and historical weekly targets. Embedded photos are stored before the atomic record replacement; if record persistence fails, previous local media is restored. Old storage paths/signed URLs never enter new photo records. Unsupported/corrupt input fails before import. Keep the original JSON and original image files until the result is checked.

## Required before switching from the old app

1. Connect the owner's Supabase account and create/select a new independent project. Verify its project reference differs from `csjhpmqagaltnaicgryp` before every mutation.
2. Apply the three prepared migrations in order. Keep per-user RLS and private photo storage enabled.
3. Enable email/password registration with confirmation and email delivery. Configure the independent HTTPS app URL and allowed development redirects. Put only the new URL and public publishable/anon key in the frontend; no management/service-role secrets.
4. Deploy to a separate HTTPS address. A loopback preview is only accessible on its PC and is not the mobile deployment.
5. Verify real registration/confirmation/sign-in/recovery/sign-out; make matching updates on two signed-in devices, including photos, deletion, account changes, offline edits and expired-session recovery.
6. Verify a trainer, two clients and another trainer: consent opt-in/revocation, goal-write conflicts, assigned workout delivery, chat isolation and photo sharing.
7. Import an owner-reviewed legacy backup into the intended new account, compare counts and representative values, and re-upload any old cloud-only photo files. Keep using the old app until these checks pass.

At this revision no hosted Supabase project or cross-device integration has been verified. Local unit/PostgreSQL tests and visual QA do not substitute for those checks.
