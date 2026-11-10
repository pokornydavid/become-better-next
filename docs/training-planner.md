# Training planning

The `#planning` section shares the selected date and week with training. It is available when training tracking is enabled and has two tabs:

- **Plán a série**: user-defined weekly set targets, a repeatable split of 1–28 custom-named days, and an explicit action to prepare the selected week.
- **Progres cviků**: exercise history linked by personal names, a load chart, previous-session comparison, and links back to workout logs.

## Counting and classification

Each checked strength set counts once for its exercise's primary muscle in its workout's Monday–Sunday calendar week. Active or manually logged sets count even before the workout is finished. Deleted sets, exercises, workouts, and cardio are excluded. Blank/unknown muscle labels are shown as unassigned, not guessed. Generic legacy `Záda`, `Nohy`, and `Hýždě` are no longer default target rows. They remain on historical records and can be explicitly reassigned. Default back groups are now lats and upper back.

Selecting a muscle updates all non-deleted exercise records with the same normalized name. Names ignore case and repeated whitespace; different variants should use different names. Future personal exercises and copied workouts retain the classification. The picker and existing workout cards both expose the muscle selector.

## Personal muscles and watchlist

Users can add, rename, hide and reorder muscles in the planner. Arrow controls move visible rows; `muscleOrder` stores the ordered IDs, retaining hidden entries and appending new muscles. This order is also used in muscle selectors. Custom muscle definitions use `customMuscle_<uuid>` goal fields and stable `custom:<uuid>` exercise values. Renaming preserves targets and historical links. Visibility (`muscleVisible_<id>`) and default label overrides (`muscleLabel_<id>`) are separate goal fields; hiding does not delete exercises or sets. Custom definitions are reused by workout, exercise-picker and library controls.

Progress starts with no watched exercises. Add/remove actions set independent `watchExercise_<encoded-normalized-name>` flags. Only watched names appear in the main selector. All historical logs remain intact; the history link in a workout explicitly adds that exercise to the watchlist.

## Split and storage

Targets use independent `weeklySets_<muscle-id>` fields on the owner's existing `goals` record. `trainingSplit` is a JSON string of `{id,name,rest}` entries, paired with `splitStart`. Legacy entries without IDs receive deterministic IDs on read, retained on save. Existing day IDs survive reordering, renaming and rest toggles. Newly added days have distinct IDs, even when names repeat. Records remain compatible with the existing primitive payload format, owner isolation, field-level synchronization, backups, and imports; no database migration is needed.

Each non-rest split day gets an editable column before the actual completed count and independent weekly target. `splitSets_<muscle-id>_<split-day-id>` stores sets per occurrence of that training day. The row's planned weekly total multiplies each allocation by that day's actual occurrences in the selected Monday–Sunday week. This supports cycles shorter or longer than seven days and weeks before the start. Header counts explain the calculation; duplicate names include their cycle-day number. Rest days are excluded. The row shows the planned total and any remaining/excess amount relative to the weekly target; completed sets remain based solely on checked workout logs. Allocations do not generate exercises or check off sets. Removed-day allocations remain stored but do not contribute to the current split; presets/new days start with fresh IDs.

Above the table, **Celkem sérií na trénink** sums the visible muscle allocations in each split column. These totals represent one occurrence of that training day, without multiplying by its weekly frequency. Editing allocations updates the cards automatically; no additional settings are stored.

Split dates use continuous calendar-day offsets from the start, including across DST and week boundaries. Saving a split does not create workouts. **Použít split na tento týden** explicitly creates empty planned workouts/rest flags in one local batch. Dates with live workouts are skipped, daily nutrition is preserved, and repeated application does not duplicate workouts. It does not allocate exercise sets based on ambiguous custom split names.

## Exercise progress

Only checked sets are historical observations. A simple comparison shows the previous and latest recorded load with both dates and repetitions. The chart has one selectable, zero-based column per workout, with its exact weight, date and repetitions printed on it. Detailed historical rows are collapsed by default. Duplicate occurrences of the same exercise name in one workout combine into one session. Missing weights/reps do not become zero-load observations. A recorded zero load is valid. Tables retain every dated session, checked-set count, and recorded load × reps volume. Period filters include today and exclude future entries.

Verification: `npm test`, `npm run build`, and desktop/mobile UI flows for target persistence, split application, classification, checked-set totals, and copied-name history.
