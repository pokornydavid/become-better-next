# Copied workouts and concurrent tabs

A background sync in a second tab previously wrote its stale in-memory store over a newly copied workout's local records. A later storage event could then remove the copy or its children from the first tab before upload.

Authenticated repository writes now merge the latest account storage before building a patch and immediately before persistence. Storage events merge pending in-memory records back into storage when necessary, without writing identical data repeatedly. Field timestamps, delete tombstones and maximum server revisions survive the merge. Acknowledgements clear only matching versions; a stale response cannot lower a revision or discard newer pending edits. Explicit anonymous demo resets retain replacement behavior.

Training defaults to an active or populated workout when no explicit selection is available, instead of an empty split placeholder. Tabs display exercise counts. Copying an empty placeholder explains that the original populated workout must be selected. Existing duplicate/empty plans are preserved for the owner to review; nothing is automatically deleted.

Regression coverage uses two repositories sharing storage: Tuesday-to-Monday copying followed by stale sync, interleaved edits, cross-tab acknowledgements, stale writes from an old tab, storage-event loop prevention and storage failures. No schema or old-app changes are required.
