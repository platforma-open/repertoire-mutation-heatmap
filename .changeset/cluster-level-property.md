---
'@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow': minor
'@platforma-open/milaboratories.repertoire-mutation-heatmap.model': minor
'@platforma-open/milaboratories.repertoire-mutation-heatmap.block': minor
---

Support cluster-level inputs (A-0016). A value computed per cluster (keyed by `pl7.app/clusterId`) is now resolved down to the individual variants through the clustering block's `variant→cluster` linker (`pl7.app/link`) with an explicit join in the precalc, so each variant inherits its cluster's value and the grid stays per variant. Applies to all three cluster-capable inputs:

- the `property` value mode,
- the property-range subset filter,
- the composition-enrichment view's per-round frequencies.

Discovery now traverses the linker (`findColumns` `maxHops: 1`) for both the property picker and the round-frequency picker, so cluster-keyed columns surface alongside variant-keyed ones; the linker column itself is excluded from the property picker.
