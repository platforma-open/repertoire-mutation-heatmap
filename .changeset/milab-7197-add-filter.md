---
"@platforma-open/milaboratories.repertoire-mutation-heatmap.block": minor
"@platforma-open/milaboratories.repertoire-mutation-heatmap.model": minor
"@platforma-open/milaboratories.repertoire-mutation-heatmap.ui": minor
"@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow": minor
---

Update the SDK and accept a variant subset filter (e.g. Lead Selection picks) with the input state matrix. The dataset list is built with buildDatasetOptions (requireEnrichments: false). The subset restricts the variants before any map is computed, so the mutation landscape, drill-downs and composition enrichment cover the subset only (composition fractions are relative to it). Maps of a subset run carry a trace rooted in the subset, and the default subtitle names it. The score and round pickers offer only full-data columns and columns computed on the same subset, labeled by their trace, and the workflow refuses a mismatched pick. The parent list offers only parents with variants in the subset. Changing only the subset keeps the parent if the subset reaches it, and the full-data picks. When the profiler gives no parent residue, the parent is still guessed from all variants, not only the subset's, so a subset of mutants cannot change it. Unfiltered runs are unchanged. The co-occurrence drill-down no longer fails when several single mutants carry the same substitution.
