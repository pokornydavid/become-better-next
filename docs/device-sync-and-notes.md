# Phone/PC workout reliability and exercise notes

Workout selection now prefers recorded sets over copied plans on the same date,
with deterministic fallback order and explicit selection still taking precedence.
Tabs show completed/total sets to distinguish duplicates. No workout is removed
or combined automatically.

Numeric fields persist valid changes immediately. Leaving a focused stale field
does not write over a newer cloud value. Temporary blanks/invalid drafts do not
erase saved loads; an explicit blank saves on blur. Installed apps synchronize on
visibility/page lifecycle events as well as periodic refresh, focus and reconnect.
The OS can still interrupt a background request, so local persistence and retries
remain necessary.

Account records with revision zero are requeued when loading storage even if an
older client lost their pending list. Reconciliation preserves payloads, stamps
and deletion tombstones. One failed upload no longer prevents later sets from
being attempted. The sync indicator checks the pending queue before reporting
success. No database migration or data reset is involved.

Each exercise occurrence has an optional single-line `notes` field (500
characters), saved through the existing field-level merge and backup format.
Completed exercise history displays these notes. Copying a workout leaves the
original note in history and starts the new occurrence with an empty note.

Regression coverage uses separate phone/PC storage and a CAS transport, plus the
real numeric-input component: Monday versus Tuesday, duplicate plans, queue
recovery, reconnect, independent fields, conflicts, failed uploads, account
switching, immediate save and focused stale values.

The reported user's Monday values were not read from the phone or cloud in this
session. These tests verify the mechanisms, not recovery of that specific log.
After deployment both installed clients need to load the release, then the phone
must finish synchronization before the PC can retrieve phone-only changes.
