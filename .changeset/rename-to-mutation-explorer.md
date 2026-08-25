---
"@platforma-open/milaboratories.repertoire-mutation-heatmap.block": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.model": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.ui": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow": patch
---

Rename the block to "Mutation Explorer"

The block's displayed name changes from "Deep Mutational Scanning" to "Mutation Explorer", in the
model title, the block-pack manifest and the workflow's trace label. The name now matches the
Mutation Explorer block in the precision-synthetic-library-analysis umbrella spec, and says what the
block does rather than naming the assay class it was first built for.

The trace label change is visible downstream: dataset dropdowns in consuming blocks show the new
label. The trace `type` is unchanged, so provenance still resolves. Package identifiers and the block
kind are unchanged.

The long description is corrected alongside it. Three claims were wrong: the upstream block is called
"Amplicon Profiling", not "Amplicon Repertoire Profiling"; the plot is scoped to one parent picked in
Settings, rather than faceted by parent; and the region-membership track only appears when the
profiler supplied a region scheme, so it is no longer described as always present. Sort-Seq is named
alongside Tite-Seq as a score source, and the Enrichment view now says it draws one panel per
non-baseline round.

The "Score columns" tooltip is rewritten for a biologist: it now leads with what the setting does,
names Tite-Seq and Sort-Seq as example sources, and drops the sentence about the page having nothing
to draw, which the page's own empty state already says.
