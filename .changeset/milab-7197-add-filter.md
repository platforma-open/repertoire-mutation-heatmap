---
"@platforma-open/milaboratories.repertoire-mutation-heatmap.block": minor
"@platforma-open/milaboratories.repertoire-mutation-heatmap.model": minor
"@platforma-open/milaboratories.repertoire-mutation-heatmap.ui": minor
"@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow": minor
---

Update the SDK and accept a variant subset filter (e.g. Lead Selection picks) with the input state matrix. The dataset list is built with buildDatasetOptions (requireEnrichments: false). The subset restricts the variants before any map is computed, so the mutation landscape, drill-downs and composition enrichment cover the subset only (composition fractions are relative to it). Maps of a subset run carry a trace rooted in the subset, and the default subtitle names it. Changing only the subset keeps the parent and the score and round picks. Unfiltered runs are unchanged. The co-occurrence drill-down no longer fails when several single mutants carry the same substitution.
