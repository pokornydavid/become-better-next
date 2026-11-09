# Training planning

The `#planning` section shares the selected date and week with training. It is available when training tracking is enabled and has two tabs:

- **Plán a série**: user-defined weekly set targets, a repeatable split of 1–28 custom-named days, and an explicit action to prepare the selected week.
- **Progres cviků**: exercise history linked by personal names, a load chart, previous-session comparison, and links back to workout logs.

## Counting and classification

Each checked strength set counts once for its exercise's primary muscle in its workout's Monday–Sunday calendar week. Active or manually logged sets count even before the workout is finished. Deleted sets, exercises, workouts, and cardio are excluded. Blank/unknown muscle labels are shown as unassigned, not guessed. Old `Nohy` labels remain a separate group rather than being assumed to mean quadriceps.

Selecting a muscle updates all non-deleted exercise records with the same normalized name. Names ignore case and repeated whitespace; different variants should use different names. Future personal exercises and copied workouts retain the classification. The picker and existing workout cards both expose the muscle selector.

## Split and storage

Targets use independent `weeklySets_<muscle-id>` fields on the owner's existing `goals` record. `trainingSplit` is a JSON string of `{name,rest}` entries, paired with `splitStart`. Records remain compatible with the existing primitive payload format, owner isolation, field-level synchronization, backups, and imports; no database migration is needed.

Split dates use continuous calendar-day offsets from the start, including across DST and week boundaries. Saving a split does not create workouts. **Použít split na tento týden** explicitly creates empty planned workouts/rest flags in one local batch. Dates with live workouts are skipped, daily nutrition is preserved, and repeated application does not duplicate workouts. It does not allocate exercise sets based on ambiguous custom split names.

## Exercise progress

Only checked sets are historical observations. The chart plots the highest recorded weight per workout, displaying the repetitions of that set. Duplicate occurrences of the same exercise name in one workout combine into one session. Missing weights/reps do not become zero-load observations. A recorded zero load is valid. Tables retain every dated session, checked-set count, and recorded load × reps volume. Period filters include today and exclude future entries.

Verification: `npm test`, `npm run build`, and desktop/mobile UI flows for target persistence, split application, classification, checked-set totals, and copied-name history.
