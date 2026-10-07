---
'@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow': minor
'@platforma-open/milaboratories.repertoire-mutation-heatmap.model': minor
'@platforma-open/milaboratories.repertoire-mutation-heatmap.block': minor
---

Draw the per-position baseline in the parent row, on a log colour scale

**The parent row carries Sort-Seq's per-position baseline.** Where the landscape draws one of
Sort-Seq's per-gate enrichments, the parent-residue cell at each position takes that position's
baseline value — the score of the parent's synonymous variants. Each column of the map then shows
its own reference, and every mutation in that column is read against it.

The baseline is matched to the score on its condition, its gate and the block that produced it, so
a map always draws the reference belonging to the score it is showing.

**A logarithmic colour scale for those scores.** An enrichment is a ratio, so the colour ramp is
symmetric-log: half the reference and twice it sit the same distance either side, and cells at zero
are covered. Cell values, tooltips and legend ticks stay the raw enrichment.

It is the default a chart is seeded with, so it applies to charts created from now on. A chart that
already holds its own gradient keeps it, and its gradient settings can be reset to pick this up.

**The score list offers per-variant columns.** A landscape cell holds one variant's value, so the
list offers the numeric columns keyed on the variant axis alone.
