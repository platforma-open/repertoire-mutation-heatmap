---
"@platforma-open/milaboratories.repertoire-mutation-heatmap.block": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.model": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.ui": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow": patch
---

One mutation-landscape chart per score, each with its own colour scale

Selecting several scores used to draw one heat map faceted by score, with one colour scale shared
by every facet. A heatmap chart cannot do otherwise: miplots4 takes the value extent across all
facets and offers no per-facet colour option. Scores in different units — a Tite-Seq affinity next
to a Sort-Seq bin score — came out unreadable, because the wider score used up the whole scale.

Each score now gets its own chart with its own extent, scale and legend. One is on screen at a
time, picked by tabs next to the chart title. Stacking them would need a fix in graph-maker, which
mounts every chart into a hardcoded DOM id, so a second instance lands in the first one's
container.

- Workflow: one saved frame and one imported value column per score, keyed `[position, state]`.
  Each column carries the score's label, the upstream column's id and its place in the user's
  order. The `parentId` axis is gone: the plot is scoped to one parent, but GraphMaker requires
  every axis to be consumed by an input, which put a one-choice "Show for" selector above the plot.
- Model: new `landscapePanels` output listing the charts to draw. `singleMutantHeatmapStates` holds
  one chart state per score, keyed by the score column's id so settings survive a reorder; the old
  single state stays as the placeholder shown before the first run. Data version `v2`.
- UI: one GraphMaker for the selected score, with a tab per score, remembered in
  `selectedLandscapeScore`. The Settings panel gets a fixed 320px width, matching other blocks —
  GraphMaker gives a block's settings slot no width of its own, so the drawer used to grow to fit
  the longest line of text. This applies on the Enrichment page too, which shares the component.

Existing projects keep their results, but the landscape chart settings reset once. The landscape
p-columns are block outputs only, so nothing downstream is affected.
