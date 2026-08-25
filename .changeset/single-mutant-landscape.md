---
"@platforma-open/milaboratories.repertoire-mutation-heatmap.block": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.model": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.ui": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow": patch
---

Add the Single Mutant Landscape view and remove the subset filter

The landscape plots per-variant score columns picked from the result pool at position × residue,
restricted to single-mutant variants. A cell holds the value of the one single-mutant variant
carrying exactly that substitution — taken directly, not averaged over every variant carrying the
residue — so it reads as a per-mutation effect rather than a population marginal. Cells no single
mutant covers are absent. Selected scores render as side-by-side facets on a block-local `score`
axis, in the order the user arranges them.

The subset filter and its "All variants" vs "Filtered" facets are removed, along with the
block-local `subset` axis on the main heatmap.
