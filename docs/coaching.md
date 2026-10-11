# Coaching development implementation

The old live application and its database are independent and untouched. This implementation belongs only to the new Become Better repository.

## Current product flows

- Open **Trenéři & klienti** in the sidebar or the people icon in the mobile header. The profile also links to this screen.
- Without a signed-in new account, this is a clearly labeled local demonstration. It uses fictional clients; additions, notes, plans and messages stay under `become-better-next:coaching-demo:v1` in this browser.
- With the new Supabase connected, create a team and invite a client by account email. Creating an invitation only generates a code; no email is sent automatically. The code expires after seven days and is usable once by its intended email.
- The recipient signs into the new app, previews the invitation, sees the team and requested role, and explicitly accepts. A client consents to sharing training, nutrition, recovery, goals and measurements. Photo sharing is a separate opt-in, off by default.
- A team owner can invite additional trainers. Trainers in that team share the accepted clients and can write private staff notes, add text instructions and participate in client chat. Clients see their own collaboration, plans and chat; they cannot read staff notes or other clients.
- **Plán a cíle** contains the selected client's nutrition goals, actual weekly budget and planned workouts. A separate management checkbox on invitation acceptance or **Moje sdílení s týmem** permits goal updates and adding workouts. Existing memberships default to management disabled. Photo consent remains independent.
- With management consent, trainers can set daily/weekly calories, protein/carbs/fat, target weight, goal mode and workout frequency. The server accepts only these fields, checks the loaded goal revision, preserves unrelated fields and advances per-field timestamps. A concurrent edit requires refreshing and reviewing current goals.
- The workout builder accepts 1–20 personally named exercises, each with 1–20 planned sets, repetitions, optional weight and workout notes. An authenticated RPC writes the complete workout/exercise/set tree in one transaction to the client's account. The client's normal diary receives it through synchronization; sets begin incomplete. Invalid plans roll back without orphan records.
- Trainers can inspect client workout sets and consented photos, including comparison/export. They cannot rewrite daily logs, completed sets, measurements or saved image edits. Progress phases are readable alongside accepted client records; their photos still require photo consent.
- A client can turn photo access off or end the collaboration. Ending it removes the team's link, its shared chat, plans and notes; personal records and original files remain owned by the client. Other independently accepted teams are unaffected.
- The team owner can remove a cooperating trainer. The owner cannot remove themselves through this control.

## Access enforcement

The migration enables RLS on all coaching tables, revokes direct writes and exposes authenticated RPCs that derive the caller from `auth.uid()`. Invitation acceptance additionally verifies the email against `auth.users`.

Personal `commit_record` remains owner-only. Read policies extend to accepted team clients, with a separate photo-consent check on photo records, albums and private storage. Trainer management RPCs require both membership of the exact team and client-granted management in that team. They lock the consent row so revocation and writes are serialized. Direct table writes remain denied. Staff notes and conversations retain their existing scope; sender and trainer names are resolved on the server.

The tests run real PostgreSQL policies and functions using PGlite. They check wrong-email invitations, read isolation, private notes, two trainers, two clients, photo opt-in/withdrawal, prohibited uploads to a client's storage folder, member removal, anonymous calls and immediate access revocation. They also exercise personal record CAS and storage ownership.

For RLS/grants and SDK download behavior, implementation references are [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Storage download documentation](https://supabase.com/docs/reference/javascript/storage-from-download).

## Remaining before a private beta

No hosted database is connected yet. Apply all three migrations only to a new development project, provide its public frontend connection, and test the complete flows with separate real accounts before inviting testers. Test two cooperating trainers updating goals concurrently, consent withdrawal, workout delivery and client offline recovery too. The chat currently polls while the screen is visible; it has no push notification or message receipt feature. Record backups exclude photo files and the separate local coaching demonstration. Hosted backups/exports, production rate limits, invitation cancellation, retention and editing/removing assigned workouts remain follow-up work.
