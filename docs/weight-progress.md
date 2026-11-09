# Body-weight progress

`WeightProgress` replaces the unlabeled weight sparklines in Overview and Progress → Měření. The full view displays latest recorded weight/date, signed change since the first observation, change since the previous observation, and the difference from the configured goal. These summary cards use the complete history; the graph has a separately labeled change for its selected 7/14/30/90-day or all-time period. Each day range includes today and the preceding days up to that length.

Every plotted point has its weight and date. Selecting it by pointer or keyboard shows that observation and its change from the preceding plotted point. Points represent observations, not interpolated daily weights. Long histories scroll horizontally, and the chart starts at the latest observation. Overview shows the last seven observations with the same all-time summary.

`weightEntries` filters deleted, invalid, non-positive, and future observations without modifying stored records. Same-day observations remain distinct and sort by record timestamp, then ID. Differences are rounded to two decimals to avoid floating-point artifacts. Empty/one-point periods have no invented change. Measurement history, recording, account synchronization, and the old application remain unchanged.

Verification: weight calculation tests, existing application tests, production build, pointer and keyboard point selection, period switching, and desktop/mobile layout checks. Test observations are synthetic.
