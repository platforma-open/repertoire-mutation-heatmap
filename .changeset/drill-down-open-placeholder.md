---
"@platforma-open/milaboratories.repertoire-mutation-heatmap.block": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.model": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.ui": patch
---

MILAB-6876: no table placeholder when a drill-down is opened

Opening the Table tab showed the not-ready placeholder — "Select score columns in Settings, then
Run" — for as long as a model round trip takes, on a block where scores were plainly selected. It
appeared on the first drill-down opened, went away for every one after it, and came back once all
of them were closed.

That overlay is what a freshly mounted grid shows until its first rows arrive, and the grid mounts
on every switch to the Table tab. What varied was how long the rows took: `activeDrillDown` was a
precondition for the table existing at all, so whenever it was unset the model returned nothing and
the table was torn down — output, columns and data source — and the next drill-down paid a cold
rebuild. With one already open the model recomputed from one live table to another and the rows
landed before the overlay was perceptible.

Both ways of reaching the unset state are gone:

- the table no longer requires an active drill-down. It is built as soon as the run has produced
  the linker, and `activeDrillDown` supplies the filter it is pinned to. `sourceId` comes from the
  persisted table state and not from the filters, so pinning a substitution is a re-query against a
  source that already exists — the same path as switching between two open drill-downs, which was
  never slow. Before anything has been browsed the table is unpinned and nothing renders it
- closing the last drill-down leaves the field naming the one just closed instead of blanking it. A
  stale id costs nothing: no section lists it, no page renders it, and the model simply keeps one
  table spec warm

Opening also writes the field in the same breath as the section rather than leaving it to the
page's on-mount watcher, which saves a round trip on the way in.
