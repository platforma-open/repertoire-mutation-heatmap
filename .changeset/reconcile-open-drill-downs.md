---
"@platforma-open/milaboratories.repertoire-mutation-heatmap.block": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.model": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.ui": patch
---

MILAB-6876: drop drill-downs the current results cannot serve

An open drill-down is a substitution plus the score it is measured on, and both could stop existing
under the block. Deselect that score, or move the plot to another parent, and the section stayed in
the sidebar pointing at a page with an empty table and a map with no value column — a dead end that
looked like a broken block rather than a stale link. A drill-down now records the parent it was
opened under, and open entries are reconciled against each run's results.

Pruned on positive evidence only, never on its absence: `landscapePanels` is `undefined` while the
outputs are not ready and `[]` before any score has produced data, and reading either as "your
score is gone" would throw the user's open browsers away every time a run starts. An entry that
recorded no parent — opened before this shipped — is left alone rather than guessed at. No
migration: `parentId` is optional on a shape that is not released.

`DrillDownPage` now redirects itself when its own entry disappears, so a pruned page does not leave
the sidebar with nothing selected. That also covers a `/drilldown?m=` URL reached directly with a
substitution that was never open.
