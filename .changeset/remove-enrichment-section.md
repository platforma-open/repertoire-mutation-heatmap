---
'@platforma-open/milaboratories.repertoire-mutation-heatmap.block': minor
'@platforma-open/milaboratories.repertoire-mutation-heatmap.model': minor
'@platforma-open/milaboratories.repertoire-mutation-heatmap.ui': minor
'@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow': minor
'@platforma-open/milaboratories.repertoire-mutation-heatmap.kind': patch
---

Remove the Enrichment Analysis section

- Drop the composition-enrichment view: the "Enrichment Analysis" settings section, its page, and its sidebar link
- Stop reading per-round frequency columns and computing the per-position log2 fold change map
- The mutation landscape and drill-down views are unchanged, including scores that come from Enrichment blocks
