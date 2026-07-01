# @platforma-open/milaboratories.repertoire-mutation-heatmap.block

## 1.1.0

### Minor Changes

- a6095eb: Add the composition-enrichment view: a per-round positional log2 fold change of residue composition versus a baseline round, computed from an upstream Enrichment block's per-round frequency columns. Rendered as its own "Composition Enrichment" page (X = position, Y = state, tab = parent, one panel per non-baseline round) on a diverging colour scale.

  Cross-block columns from the Enrichment block (per-round frequencies and enrichment scores) are now discovered via `ColumnCollectionBuilder.findColumns`, anchored on the abundance axis, so they resolve in the workflow — previously they failed because `getCanonicalOptions` baked their nested-domain into the id. The property picker uses the same discovery (state-matrix + abundance anchors) and is now filtered to numeric columns only.
