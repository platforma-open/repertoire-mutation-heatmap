# @platforma-open/milaboratories.repertoire-mutation-heatmap.workflow

## 1.1.6

### Patch Changes

- ec62268: MILAB-6876: open the drill-down table on its five useful columns

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

- 860d80f: MILAB-6876: outline the parent residue on both heat maps

  The unmutated reference every score and fold change is measured against is now marked in the
  picture, not only on the annotation track beneath it.

  - the workflow emits `pl7.app/repertoire/isParentResidue`, a per-cell subset column present only
    at the parent residue, in both heat maps' frames
  - the mutation landscape declares its cell axes dense, because the parent cell is absent there by
    construction: a single mutant differs from its parent, so no variant carries the parent residue
    at its own position. The full position x state grid supplies the cell; uncovered substitutions
    arrive with no value and stay empty
  - a `v3` migration pins "Treat NA value as: empty" on landscape charts saved before this, which
    would otherwise paint every uncovered substitution as a real zero

  Parent residue also moves from an annotation track to the second part of the X axis label, so each
  column reads "32, D" — the position and the residue it started as — rotated 45° to fit. The region
  track stays where it is. A `v4` migration angles the labels of charts saved before this, which the
  defaults cannot reach: the angle is a chart's own axes setting, seeded once when it is created.

  Needs the graph-maker release that adds the heat map Highlight input.

- 459a062: MILAB-6876: per-position variant browsing

  A cell on the mutation landscape says "A5C scores 0.8". The next question is always the same:
  what else did we observe that carries this substitution, and what happened to it there? Browsing
  into a substitution now answers it, in a section of its own under the landscape.

  - **Table tab** — every observed variant carrying the substitution, from the lone single mutant to
    every combination it appears in, with sequence, mutations, mutation count, abundance and the
    selected scores joined in from the result pool.
  - **Heatmap tab** — the double mutants containing it, on the same position x residue grid, where
    each cell is now the _partner_ substitution. The fixed mutation is drawn in its own cell and
    outlined, carrying the singleton's own score — the reference every pair is read against. Cells
    with no observed double mutant stay empty; nothing is filled in from a model.

  Sections accumulate, so several substitutions can be compared without losing the earlier ones, and
  each page carries its own close control. Browsing writes UI state only — it reaches neither `args`
  nor `prerunArgs` — so nothing goes stale and no Run button appears. A `v5` migration adds the
  field; projects made before this simply have none open.

  The workflow precomputes the drill-down for every cell in one run, from data it already had: the
  per-variant mutation cells the landscape derives are reused without the `mutationCount == 1`
  predicate, so mutation membership needs no designator string parsed. Three new outputs — the
  co-occurrence count, the mutation-to-variant linker, and the partner pair map. A library with no
  multi-mutants produces an empty pair map and costs nothing.

  Variants of any mutation count are covered: the Table tab lists every variant carrying the
  substitution, triples and beyond included, while the partner map draws doubles — which is what a
  partner map is.

  The ptabler step's RAM request is now set explicitly. It was sized from `f.size()`, which counts
  only inputs attached with `addFile()`, and this workflow attaches none — everything is read
  through `pt.p.column`. So the measured volume was zero and the run always received the 2 GiB
  floor, whatever the library: a ~1M variant profiling run gives a ~118M row state matrix and got
  the same request as a 2M row one. This affected the block before this feature existed.

  The landscape's tooltip now carries a **Co-occurring variants** count, so a cell says whether it
  has anything to browse before the click is spent. It is worth showing for its own sake: it says
  how well a substitution has been explored in combination, which is a fact about the library.

  A drill-down is opened by clicking the cell. A cell with nothing to browse answers when asked:
  clicking it explains why — the substitution is carried by no multi-mutant, or the cell is the
  parent residue and names no substitution at all. Nothing is announced up front, and no click is
  silently ignored, which is what made an empty dataset read as a broken block. Only cells with at least one co-occurring variant
  respond — the rest would open a browser holding nothing but the singleton just clicked, so they
  keep the default cursor and do nothing.

- 98cb8a9: MILAB-6876: raise the SDK catalog

  `@platforma-sdk/model` and `ui-vue` 1.83 -> 1.84.1, `workflow-tengo` 6.9.0 -> 6.12.1,
  `block-tools` 2.15.0 -> 2.16.3, `tengo-builder` 4.0.25 -> 4.1.4. Type checks, lint and the build
  pass unchanged; no call site needed adjusting.

## 1.1.5

### Patch Changes

- 5afe4fe: Show the finer region band when the profiler subdivides a region

  The profiler can now annotate a graft inside a canonical region — an insert sitting
  inside CDR2 — and exports two readings of the per-position membership: the widest region
  containing each position, and the narrowest.

  The heat map's region band now prefers the narrow reading where it exists, so a graft
  reads as itself instead of disappearing into the region around it. It stays one band,
  not a stack: the narrow names already carry their framework, since CDR2_N, Graft and
  CDR2_C read as parts of CDR2.

  A run without grafts is unaffected. The narrow column is absent there, so the band falls
  through to the reading it has always used.

- 89e9c65: One mutation-landscape chart per score, each with its own colour scale

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

## 1.1.4

### Patch Changes

- 443ced4: Read the parent residue from the profiler instead of guessing it from the state matrix

  The parent-residue track was derived here by a majority vote over the state matrix: a matrix cell
  defaults to the parent residue, so the state carried by the most distinct variants was taken to be
  the parent's. The vote counts variants rather than reads, so it is wrong wherever most distinct
  variants are mutated at a position. Ties broke lexicographically, and a deletion is `-`, which sorts
  before every letter, so a tie reported a gap as the parent residue.

  That mattered well beyond the track itself. The mutation landscape locates a single mutant at the one
  position where its state differs from the parent's (`state != parentResidue`). A wrong residue at one
  position makes every single mutant differ there too, whatever it actually mutated, so each one is
  painted an extra cell and the map smears.

  The profiler now exports `pl7.app/repertoire/parentResidue` keyed `[parentId, position]`, taken from
  mitool, which builds it from the same object it seeds state-matrix default cells from. This block
  reads it off the state-matrix anchor — `parentId` at idx 1, `position` at idx 2, the same key the
  region track already uses — scopes it to the selected parent, and collapses it to the position axis.

  The old vote stays as a fallback for one release: a project holding a profiler run made before the
  column existed resolves the query to empty, and falls back rather than failing. Remove it once those
  projects have re-run the profiler.

  The emitted column keeps its name and axes, so both pages find the track unchanged.

- 6f31f05: Read input PColumns directly instead of round-tripping them through TSV

  Every input column went through `pframes.tsvFileBuilder`, whose `build()` calls
  `xsv.exportFrame` to write the WHOLE column out as a TSV that this workflow then
  reads back. Both halves stream, so it was never a memory problem — but the state
  matrix is `distinctVariants x parentLength` rows, so on a DMS-scale run that round
  trip costs tens of GB of scratch and two extra full passes for no gain.

  `pt.p.column` emits a `read_frame` step instead: a lazy parquet scan through
  pframes-rs, and the one read path ptabler gives a spill directory. Axes are then
  referenced by spec via `pt.axis` and aliased to the names the body already used, so
  resolution is identical to the `setAxisHeader` calls it replaces.

  Also drops the hardcoded `.mem()`/`.cpu()` requests. pt sizes both from input volume
  when neither is set (`ram = between(2 GiB + 4 x size, 2 GiB, 64 GiB)`); an explicit
  request suppresses that formula, and the old fixed 16 GiB neither grew for a large
  run nor gave memory back on a small one.

  The score and round-frequency loops now carry the loop index in their frame header,
  since each iteration adds its own frame to the same pt workflow.

- 7e831da: Cut the block down to two maps, and drop the abundance selection entirely

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

- a87f264: Rename the block to "Mutation Explorer"

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

- 6f31f05: Add the Single Mutant Landscape view and remove the subset filter

  The landscape plots per-variant score columns picked from the result pool at position × residue,
  restricted to single-mutant variants. A cell holds the value of the one single-mutant variant
  carrying exactly that substitution — taken directly, not averaged over every variant carrying the
  residue — so it reads as a per-mutation effect rather than a population marginal. Cells no single
  mutant covers are absent. Selected scores render as side-by-side facets on a block-local `score`
  axis, in the order the user arranges them.

  The subset filter and its "All variants" vs "Filtered" facets are removed, along with the
  block-local `subset` axis on the main heatmap.

## 1.1.3

### Patch Changes

- ace95ed: Release new version

## 1.1.2

### Patch Changes

- d681ee4: Add position-axis annotation tracks to the mutation heatmap and the Enrichment Analysis
  (per-round) plots: a region track (from the profiler's per-position region annotation, aa state
  matrix with a region scheme) and a parent-sequence track (parent residue per position, derived
  from the state matrix). Both are collapsed to a position-keyed column so GraphMaker accepts them
  as X-axis annotations.

  Rename the heatmap Y axis from "State" to the alphabet-aware "Amino Acids" (aa) / "Nucleotides"
  (nt), on both the mutation and composition-enrichment plots. Rename the X axis from the inherited
  "Position aa" / "Position nt" to "Position AA" / "Position NT".

  Show the dataset name (not the "Mutation State aa" column label) in the dataset dropdown, matching
  other blocks; append an (aa)/(nt) suffix only when a dataset exposes both state matrices.

  Set the block subtitle to the selected dataset's name (snapshotted on selection), with a
  user-rename override — matching the synthetic-repertoire-profiler block-label pattern.

  Add a parent selector to Settings so runs with multiple parents work correctly. The chosen parent
  scopes the whole plot (heatmap cells, region + parent-sequence tracks, composition), which lets the
  position-keyed annotation tracks stay exact. Parents are listed from the state matrix; the UI
  auto-selects the first one.

  Simplify the Settings UI to abundance only: drop the abundance/property "Colour by" switch and the
  per-variant property selector, leaving a single abundance selector with a self-contained tooltip.
  The value mode is pinned to abundance in the model; the workflow keeps its (now dormant) property
  path. The subset filter's separate "Filter by property" control is unchanged.

## 1.1.1

### Patch Changes

- 5c24330: Ensure that enrichment plots are shown in user defined order

## 1.1.0

### Minor Changes

- a6095eb: Add the composition-enrichment view: a per-round positional log2 fold change of residue composition versus a baseline round, computed from an upstream Enrichment block's per-round frequency columns. Rendered as its own "Composition Enrichment" page (X = position, Y = state, tab = parent, one panel per non-baseline round) on a diverging colour scale.

  Cross-block columns from the Enrichment block (per-round frequencies and enrichment scores) are now discovered via `ColumnCollectionBuilder.findColumns`, anchored on the abundance axis, so they resolve in the workflow — previously they failed because `getCanonicalOptions` baked their nested-domain into the id. The property picker uses the same discovery (state-matrix + abundance anchors) and is now filtered to numeric columns only.
