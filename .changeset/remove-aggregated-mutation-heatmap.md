---
"@platforma-open/milaboratories.repertoire-mutation-heatmap.block": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.model": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.ui": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow": patch
---

Cut the block down to two maps, and drop the abundance selection entirely

The block had four views and six settings. It now has two views and three settings. Both maps
plot position × residue over one parent, and neither aggregates over the variants carrying a
residue.

**Mutation Landscape** (renamed from "Single Mutant Landscape") is the landing page at `/` and
the only unconditional section — it is what a block with nothing selected shows, and the only
way to reach Settings. It opens with the Settings drawer out and closes it when a run starts,
the behaviour the retired main page used to own. **Enrichment Analysis** is otherwise unchanged
and still appears once a baseline and one comparison round are chosen.

Settings is now: dataset, parent, score columns, then an Enrichment Analysis section holding the
round frequencies. The score picker sits at the top level rather than behind an accordion — it
is the landing page's only input, so it should not need a click.

**Abundance is gone.** It was never plotted; its only job was anchoring discovery of the
round-frequency columns, which meant the user had to pick a column for no reason they could
see. Those columns are keyed on `pl7.app/variantKey` alone — the round lives in the column's
domain, not on an axis — and the state matrix carries that axis, so they anchor on `main`
directly, exactly as the score columns already did. The workflow drops the `freqAnchor` anchor
and the abundance bundle entry with it.

Because the discovered ids were encoded against `freqAnchor`, round selections saved by an
earlier version no longer resolve. Re-pick the rounds on an existing project.

**Also removed.** The aggregated state heat map (`[parentId, position, state] -> heatmapValue`),
its per-position frequency normalization, the dormant property-value mode, and the Known
Variants heat map. With them go the `normalize`, `level`, `valueMode`, `propertyRef`,
`abundanceRef` and `knownAbundanceRef` fields, the `stateHeatmapState` and `knownHeatmapState`
view state, the `stateHeatmapPf`/`PCols`, `knownHeatmapPf`/`PCols`, `knownAbundanceOptions` and
`abundanceOptions` outputs, and the `Alphabet` and `ValueMode` types. Data persisted for the
removed fields is ignored rather than migrated — nothing reads it.

**Facets now stack one per row.** Both heat maps pin a 20px cell size, which lays the cell grid
out at its natural size across the whole position range. graph-maker's default facet grid is 3
columns, so each panel frame got a third of the width, the two disagreed, and the grid spilled
across and past the frames — visible as overlapping panels as soon as a second score or round
was selected. `axesSettings.other.facetColumns = 1` gives every panel the full width, so panels
also line up position-for-position. This is an init default, so it applies to newly created
blocks; an existing block keeps its persisted chart state and needs the facet-column setting
changed once by hand.

**The region and parent-residue tracks use the `triadic` categorical palette**, matching the
synthetic-repertoire-profiler block that renders the same two tracks. It is the only categorical
palette carrying 27 colours; the 9-colour default repeats a colour every 9th residue, which is
visible across the 20 residues plus gap on the Parent AA track. The enrichment map keeps its
`blue_red` diverging palette for the signed log2 fold change and gains the categorical one
alongside it.

The region-membership and parent-residue annotation tracks are otherwise untouched: both surviving maps
share the position axis and already added them to their own frames.
