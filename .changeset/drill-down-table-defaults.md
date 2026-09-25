---
"@platforma-open/milaboratories.repertoire-mutation-heatmap.block": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.model": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.ui": patch
---

MILAB-6876: open the drill-down table on its five useful columns

The Table tab discovers every variant-keyed column in the result pool, so a project carrying UMAP
dimensions, sequence properties and two conditions' worth of scores opened ~15 columns wide. It now
opens on Variant Id, Mutations, the mutation count, the sequence, and the one score the drill-down
was opened from. Everything else is `optional` — still in the column picker, switched off.

- the score is matched by name + domain, not by id: `ColumnSelector` has no id form, and name +
  domain is what tells `Bin score (5.5)` from `(7.5)`. It resolves against the undeduped discovery,
  because `scoreOptions` dedups on name+domain while the table dedups on leaf id, and the two can
  keep different reachability variants of one column
- these defaults SEED a table; they do not re-apply to one that has already been opened. A saved
  column selection outranks the rules rather than merging with them — `computeHiddenColumns` takes
  the state's `hiddenColIds` instead of the rule-derived optional set whenever one is present, and
  the grid persists one on its very first render, from intrinsic annotations alone. No migration is
  shipped for this: the drill-down is unreleased, so the only affected tables are in development
  projects, and recreating the block clears the state (`createDefaultPTableParams` leaves
  `hiddenColIds` null). Worth knowing before the next change to this table's defaults
- the `mutationId` axis is hidden in tables, via a `pl7.app/table/visibility` annotation on the axis
  spec itself. The table is already pinned to one mutation by a model-side filter, so the axis drew
  one constant value in every row. The model cannot reach it: `ColumnsDisplayOptions` carries rules
  for columns only, and axis visibility is derived from whether a primary column declares the axis —
  which this one is, being half of the linker. Charts are unaffected; graph-maker reads no
  `pl7.app/table/*`

Drill-down chart: the partner map's Metadata picker is narrowed to the open drill-down's own score,
via GraphMaker's `metaColumnPredicate`. The workflow writes one pair frame per score and each
carries its own `partnerMutation` and `pairVariantKey` beside `cellValue`, so four selected scores
put four identically-labelled "Partner mutation" and four "Variant" entries in the picker. Only
`cellValue` differs per score; the other two are properties of the cell. Emitting them once is not
available — that is the hoist out of the per-score loop the workflow's NOTE records as fatal to
ptabler — so the copies stay in the frame, where `companion()` and saved chart states still resolve
them, and only the picker is filtered.

Drill-down chart title is hidden (`axesSettings.title.mode`), not merely empty: an empty title still
reserves its band, which drew a blank strip under the PlBlockPage header. Landscape charts keep
theirs — they have no PlBlockPage header, so GraphMaker's title is the page heading and the score
tabs render into its title-line slot.
