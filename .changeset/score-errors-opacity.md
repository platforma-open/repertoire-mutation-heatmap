---
'@platforma-open/milaboratories.repertoire-mutation-heatmap.block': minor
'@platforma-open/milaboratories.repertoire-mutation-heatmap.model': minor
'@platforma-open/milaboratories.repertoire-mutation-heatmap.ui': minor
'@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow': minor
---

Show score errors on the mutation maps

- A score's error from Sort-Seq Analysis or Enrichment Analysis fades its cells: a large error draws faint, a small one solid
- The error and the number of synonymous nucleotide variants behind it appear in the cell tooltip and, for the browsed score, in the drill-down table
- A score with no error estimate carries a warning that cannot be closed
- Upgrade graph-maker to 1.10.3 and the Platforma SDK to the latest versions
