---
"@platforma-open/milaboratories.repertoire-mutation-heatmap.block": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.ui": patch
---

MILAB-6876: no table placeholder on the first drill-down opened

Opening a drill-down when none were left showed the table's not-ready placeholder — "Select score
columns in Settings, then Run" — for as long as a model round trip takes, on a block where scores
were plainly selected. Opening a second one did not, which made it read as a first-run quirk.

`drillDownTable` reads `activeDrillDown` directly and returns nothing while it is undefined, and
that field was written by the page's on-mount watcher — so the page always mounted against a
settled "not ready" model and had to wait for the id to land and the model to recompute. With one
drill-down already open the field already held a valid substitution, so the model had a live table
and merely re-filtered; closing the last one set it back to undefined, which is why the placeholder
came back. Opening now writes it in the same breath as the section, the way closing already did.
