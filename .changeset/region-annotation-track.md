---
'@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow': patch
'@platforma-open/milaboratories.repertoire-mutation-heatmap.model': patch
'@platforma-open/milaboratories.repertoire-mutation-heatmap.ui': patch
---

Add position-axis annotation tracks to the mutation heatmap and the Enrichment Analysis
(per-round) plots: a region track (from the profiler's per-position region annotation, aa state
matrix with a region scheme) and a parent-sequence track (parent residue per position, derived
from the state matrix). Both are collapsed to a position-keyed column so GraphMaker accepts them
as X-axis annotations.

Rename the heatmap Y axis from "State" to the alphabet-aware "Amino Acids" (aa) / "Nucleotides"
(nt), on both the mutation and composition-enrichment plots. Rename the X axis from the inherited
"Position aa" / "Position nt" to "Position AA" / "Position NT".

Show the dataset name (not the "Mutation State aa" column label) in the dataset dropdown, matching
other blocks; append an (aa)/(nt) suffix only when a dataset exposes both state matrices.

Set the block subtitle to the selected dataset's name (snapshotted on selection), with a
user-rename override — matching the synthetic-repertoire-profiler block-label pattern.

Add a parent selector to Settings so runs with multiple parents work correctly. The chosen parent
scopes the whole plot (heatmap cells, region + parent-sequence tracks, composition), which lets the
position-keyed annotation tracks stay exact. Parents are listed from the state matrix; the UI
auto-selects the first one.

Simplify the Settings UI to abundance only: drop the abundance/property "Colour by" switch and the
per-variant property selector, leaving a single abundance selector with a self-contained tooltip.
The value mode is pinned to abundance in the model; the workflow keeps its (now dormant) property
path. The subset filter's separate "Filter by property" control is unchanged.
