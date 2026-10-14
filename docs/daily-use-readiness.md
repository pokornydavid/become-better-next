# Daily-use readiness

The new app is independent of the live v98 app. The old repo, URL and database remain in operation until the owner explicitly chooses to switch.

## Ready in the local beta

Dark/light appearance, tracker switches, personal workouts and cardio, nutrition goals/budgets, recovery, progress phases/photos/comparison, local persistence and backups, reviewed legacy conversion, prepared trainer permissions/workout assignment/chat, and auth forms.

Readability pass: separated dark cards and fields, readable unselected client rows/day numbers, larger labels and set completion buttons, concise page instructions, a single workout overview action, daily shortcuts, collapsed secondary macro details, and a one-column account dialog. The mobile overview was visually checked at 390 px without horizontal overflow.

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

## Hosted status — 2026-10-13

The independent Supabase project `pilfcwraxpsuqssfvvjm` is connected. The three migrations were applied in one transaction through its SQL editor to a verified empty database. All application tables have RLS, anonymous table read grants are absent, and `progress-photos` is private. An anonymous REST read was rejected with 401/42501. A real account completed email confirmation and sign-in; the database contains its saved record.

GitHub Pages deployed successfully with the new cloud configuration: `https://pokornydavid.github.io/become-better-next/`. The live registration/sign-in forms are enabled and the deployed application bundle points to the new project. The Auth Site URL and redirect allowlist contain the current Pages address, the future `dpokornydev` address and the local development URL. The old production files still matched their unchanged release during prior verification.

Pending: physical PC/phone round-trip confirmation, hosted photo/coaching integration, registration/recovery on arbitrary email addresses, and final migration of any desired old data. Custom SMTP was still off on this date; see the 2026-10-14 update below. Keep email confirmation enabled. Local unit/PostgreSQL tests and server configuration checks do not replace those remaining checks.

The GitHub source repository is public at the owner's request to use GitHub Pages like the old application. Pages and its opt-in deployment flag are enabled on the independent new repository. A transfer from `pokornydavid` to `dpokornydev` was requested and needs acceptance on the destination account. Update the canonical Auth Site URL, remote URL and user-facing links after an accepted transfer; GitHub Pages addresses do not automatically redirect. The separate Sites fallback is unpublished.

## Step bridge — 2026-10-14

The additive health-connection migration was applied to the new project. Live checks rejected an invalid write key (400) and an anonymous connection-table read (401). Local PostgreSQL checks cover private metadata/hash protection, owner-only writes, preservation of PC calorie/notes fields, idempotent totals, revocation and deleted-day protection. The settings UI explicitly waits for the first real phone transfer; it does not claim a connection has received data when only a key exists. A Huawei → Apple Health → Shortcut → cloud transfer still needs setup and verification on the owner's iPhone.

## Workout usability and email setup — 2026-10-14

The workout title and exercise names have transparent backgrounds; the overview's workout label no longer has an outlined pill. Up/down controls preserve exercise/set identities and work in completed workouts. The live Pages UI was checked, mobile controls are 44 px with no horizontal overflow at a 375 px content width, and all 47 tests plus the production build passed.

Brevo custom SMTP is enabled and saved in the independent Supabase project. The owner verified the Brevo account by phone, generated a replacement SMTP key and entered it directly in Supabase. A fresh dashboard load confirmed the saved server/port, enabled SMTP and hidden stored password. The original key is deactivated; SMTP IP blocking was disabled with the owner's explicit approval because its authorized-IP list was empty. The owner deferred sending a test recovery email, so actual delivery and registration/recovery for arbitrary addresses remain unverified. No private SMTP key belongs in the repository or frontend.
