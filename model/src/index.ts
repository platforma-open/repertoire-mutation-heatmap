import type { GraphMakerState } from "@milaboratories/graph-maker";
import type {
  ColumnRecipe,
  RenderCtx,
  InferOutputsType,
  PColumnSpec,
  PFrameHandle,
  PlDataTableStateV2,
  PlRef,
  SUniversalPColumnId,
} from "@platforma-sdk/model";
import { kind } from "@platforma-open/milaboratories.repertoire-mutation-heatmap.kind";
// `createPlDataTableV3`'s return type reaches into `Nil` from helpers, and TS cannot name it
// from here without this — the same re-export every block building a table carries.
export type * from "@milaboratories/helpers";
import {
  BlockModelV3,
  ColumnsCollection,
  createPlDataTableStateV2,
  DataColumn,
  DataModelBuilder,
  createPFrameForGraphs,
  createPlDataTableV3,
  extractPObjectId,
} from "@platforma-sdk/model";

/** A selector `name`/`domain` given as a bare string normalizes to a REGEX matcher, so an
 *  exact name must be spelled out. `"pl7.app/frequency"` as a regex is unanchored and `.`
 *  matches any character, which would also admit `pl7.app/frequencyRatio`. */
const exactMatch = (value: string) => [{ type: "exact" as const, value }];

/** Collapse discovery hits to one recipe per storage column, first hit wins.
 *
 *  The retired `findColumns()` keyed its result map on the leaf column, merging several
 *  reachability variants into one entry. `discover().getColumns()` returns one recipe PER
 *  variant instead, and the value these options carry is the leaf id — so without this,
 *  variants of one column become several dropdown entries sharing a single value. */
function dedupByLeafId(recipes: ColumnRecipe[]): ColumnRecipe[] {
  const seen = new Set<string>();
  return recipes.filter((recipe) => {
    const leaf = extractPObjectId(recipe.id);
    if (seen.has(leaf)) return false;
    seen.add(leaf);
    return true;
  });
}

/**
 * The p-columns of one workflow output, or undefined while the block is still computing.
 *
 * `getPColumns()` throws two different ways and they must not be treated alike. Mid-run the
 * resource tree is incomplete and traversal can throw — that is transient and means "not yet".
 * Once the block is ready-or-error, a throw means the workflow FAILED, and swallowing it makes a
 * crashed run indistinguishable from a healthy empty one: the output reports ok with no value,
 * the block shows Done, and the map is simply blank. That cost a day of debugging once already,
 * so past readiness the error is rethrown and surfaces on the output.
 */
function outputPColumns(ctx: RenderCtx<BlockArgs, BlockData>, name: string) {
  try {
    const node = ctx.outputs?.resolve(name);
    if (node === undefined) return undefined;
    return node.getPColumns();
  } catch (e) {
    // Several outputs are emitted conditionally — the composition map only with rounds
    // selected, the drill-down only with scores. One the workflow chose not to emit is a
    // MISSING FIELD, not a failure, and has to stay invisible or every block without an
    // enrichment view reports an error.
    if (String(e).includes("field not found")) return undefined;
    if (ctx.outputs?.getIsReadyOrError() === false) return undefined;
    throw e;
  }
}

// Profiler spec names used as join keys — must stay byte-identical to the names the profiler emits.
const STATE_MATRIX = "pl7.app/repertoire/stateMatrix";
const VARIANT_KEY_AXIS = "pl7.app/variantKey";

// One such column per selected score. Must stay byte-identical to the workflow's import spec.
const LANDSCAPE_VALUE = "pl7.app/repertoire/singleMutantValue";
const LANDSCAPE_SCORE_REF = "pl7.app/repertoire/landscapeScoreRef";
const LANDSCAPE_SCORE_INDEX = "pl7.app/repertoire/landscapeScoreIndex";

// Drill-down columns. Same byte-identical contract with the workflow as the landscape names.
const MUTATION_ID_AXIS = "pl7.app/repertoire/mutationId";
const MUTATION_VARIANT_LINK = "pl7.app/repertoire/mutationVariantLink";
const BROWSABLE_MUTATION = "pl7.app/repertoire/browsableMutation";

/** One mutation-landscape chart. */
export type LandscapePanel = {
  /** The score column's own id — the key of this chart's state in `singleMutantHeatmapStates`. */
  key: string;
  label: string;
  /** Position in the user's score order. */
  index: number;
  spec: PColumnSpec;
};

/** One open per-position variant browser, added by browsing into a substitution. */
export type DrillDown = {
  /**
   * The substitution's designator (`A5C`) — the `mutationId` axis value the drill-down data is
   * pinned to, the section label, and the `?m=` query parameter. One string, so all three agree
   * without anything being re-derived.
   */
  mutationId: string;
  /**
   * The score whose map this was opened from, as a key into `singleMutantHeatmapStates`. Carried
   * so a drill-down never silently changes what it is measuring when the user switches the
   * landscape's score tab.
   */
  scoreKey: string;
  /** Which tab is on screen. */
  tab: "table" | "heatmap";
};

/**
 * The section href of one drill-down. The model builds the section list with it and the UI
 * navigates with it, so the two cannot drift apart on the encoding — which they would, silently,
 * the first time a designator needed escaping.
 */
/**
 * `A5C · Bin score (5.5)` — the substitution and the score it is measured on.
 *
 * Derived from the produced columns rather than stored on the drill-down: a stored label goes
 * stale when a score is renamed upstream, and would be missing entirely on any drill-down opened
 * before it was introduced. Falls back to the bare designator before a run has produced columns.
 */
export function drillDownLabel(mutationId: string, scoreLabel: string | undefined): string {
  return scoreLabel ? `${mutationId} · ${scoreLabel}` : mutationId;
}

/**
 * The landscape charts the last run produced, in the user's score order.
 *
 * Shared by the `landscapePanels` output and by `.sections()`, which needs the same list to name
 * one page per score — two derivations of "which charts exist" would drift the moment one of
 * them changed.
 */
export function landscapePanelsFrom(
  pCols: { spec: PColumnSpec }[] | undefined,
): LandscapePanel[] | undefined {
  if (pCols === undefined) return undefined;
  const panels: LandscapePanel[] = [];
  for (const col of pCols) {
    if (col.spec.name !== LANDSCAPE_VALUE) continue;
    const key = col.spec.annotations?.[LANDSCAPE_SCORE_REF];
    // Pre-per-score-charts run: no ref, so no state key. Such a project shows the empty state
    // until it is re-run.
    if (key === undefined) continue;
    panels.push({
      key,
      label: col.spec.annotations?.["pl7.app/label"] ?? "Score",
      index: Number(col.spec.annotations?.[LANDSCAPE_SCORE_INDEX] ?? "0"),
      spec: col.spec,
    });
  }
  panels.sort((a, b) => a.index - b.index);
  return panels;
}

/** The section href of one landscape page. */
export function landscapeHref(scoreKey: string): `/?score=${string}` {
  return `/?score=${encodeURIComponent(scoreKey)}`;
}

/** `Landscape · Bin score (5.5)` — what the sidebar shows for one landscape page. */
export function landscapeLabel(scoreLabel: string): string {
  return `Landscape · ${scoreLabel}`;
}

/** score id -> display label, from the columns the last run produced. */
export function scoreLabelsByKey(
  pCols: { spec: PColumnSpec }[] | undefined,
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const col of pCols ?? []) {
    if (col.spec.name !== LANDSCAPE_VALUE) continue;
    const key = col.spec.annotations?.[LANDSCAPE_SCORE_REF];
    const label = col.spec.annotations?.["pl7.app/label"];
    if (key !== undefined && label !== undefined) labels[key] = label;
  }
  return labels;
}

export function drillDownHref(mutationId: string): `/drilldown?m=${string}` {
  return `/drilldown?m=${encodeURIComponent(mutationId)}`;
}

// Subtitle fallback when no dataset is selected yet.
const NO_DATASET_LABEL = "No dataset selected";

/** Workflow-facing args, derived from `BlockData`. */
export type BlockArgs = {
  /** Profiler state matrix `[variantKey, parentId, position] -> state`. */
  stateMatrixRef: PlRef;
  /** Parent to scope the whole plot to. Required — the args projection throws until it is set
   *  (the UI auto-selects the first parent), so the workflow only ever runs single-parent. */
  selectedParentId: string;
  /**
   * Ordered per-round frequency columns from the enrichment block (composition-enrichment view).
   * Each is one round's `[variantKey] -> frequency` (`pl7.app/frequency`); `[0]` is the baseline round R0.
   * Empty = composition-enrichment view off.
   */
  roundFrequencyRefs: SUniversalPColumnId[];
  /**
   * Fraction-space epsilon added to both sides of the composition ratio before log2,
   * to keep emergent/vanished residues finite. Frequencies are in [0,1] (not counts),
   * so this is a small value (default 1e-6), not a count pseudocount.
   */
  compositionEpsilon: number;
  /**
   * Per-variant score columns plotted in the mutation landscape, in the user's chosen
   * order (which becomes the facet order). Empty = landscape off.
   */
  scoreRefs: SUniversalPColumnId[];
};

/** UI view state kept out of the workflow args. */
export type BlockUiState = {
  compositionHeatmapState: GraphMakerState;
  /**
   * Placeholder landscape chart, shown while no score column has produced data. Carries the
   * page's empty state and its Settings drawer — on a fresh block, the only way into Settings.
   */
  singleMutantHeatmapState: GraphMakerState;
  /**
   * One landscape chart per score, keyed by the score column's id (not its position, so settings
   * survive a reorder). The UI creates entries as runs produce new score columns; a dropped
   * score's entry is left behind, and comes back into use if the score is picked again.
   */
  singleMutantHeatmapStates: Record<string, GraphMakerState>;
  /**
   * @deprecated Each score now has its own page and the route carries the choice, so nothing
   * reads this. Left in place rather than migrated away: it is one unused optional field, and
   * dropping it would rewrite every saved project's data for no gain.
   */
  selectedLandscapeScore?: string;
  /**
   * Open drill-downs, in the order they were opened — one section each, under the landscape.
   *
   * UI state on purpose: it reaches neither `args` nor `prerunArgs`, so browsing into a
   * substitution never makes the block stale and no Run button appears. The workflow already
   * precomputed every cell's drill-down, so opening one only filters data the block holds.
   */
  drillDowns: DrillDown[];
  /**
   * The drill-down whose page is on screen, as a `mutationId`. The model has no route access, so
   * the page writes this on mount; `drillDownTable` reads it to know which mutation to filter to.
   */
  activeDrillDown?: string;
  /**
   * Chart and table settings for the drill-down pages — ONE of each, shared by all of them.
   *
   * Every ui-state write ships the whole of `data` to the backend, and a per-drill-down
   * `GraphMakerState` plus `PlDataTableStateV2` is ~11 KB each. Four open drill-downs made
   * `data` 67 KB, and every open, close and tab switch paid to send all of it — measured at
   * 2.3-4.6 s against a remote backend, versus 123 ms for a write that carries only navigation.
   *
   * Sharing is sound here rather than merely cheap: every drill-down draws the same chart with a
   * different mutation pinned, and the pin travels in `fixedOptions`, which is never persisted.
   * The table state is keyed internally by `sourceId`, so it already caches per mutation.
   *
   * The cost: settings changed on one drill-down apply to all of them.
   */
  drillDownChartState: GraphMakerState;
  drillDownTableState: PlDataTableStateV2;
};

/** Data version `v1`: one faceted landscape chart, so one chart state. */
export type BlockDataV1 = Omit<BlockDataV4, "singleMutantHeatmapStates" | "selectedLandscapeScore">;

/** Data version `v2`: today's shape. `v3` rewrites values inside it, and adds no field. */
export type BlockDataV2 = BlockDataV4;

/** Data version `v3`: the same shape again; `v4` only rewrites chart states. */
export type BlockDataV3 = BlockDataV4;

/** Data version `v4`: before per-position variant browsing, so no drill-down fields. */
export type BlockDataV4 = Omit<
  BlockDataV7,
  "drillDowns" | "activeDrillDown" | "drillDownChartState" | "drillDownTableState"
>;

/** Data version `v5`: drill-downs exist; `v6` only blanks their chart titles. */
export type BlockDataV5 = BlockDataV7;

/** Data version `v6`: the same shape; `v7` only pins a layer setting on drill-down charts. */
export type BlockDataV6 = BlockDataV7;

/** Data version `v7`: every drill-down carried its own chart and table state. */
export type BlockDataV7 = Omit<
  BlockData,
  "drillDowns" | "drillDownChartState" | "drillDownTableState"
> & {
  drillDowns: (DrillDown & {
    heatmapState: GraphMakerState;
    tableState: PlDataTableStateV2;
  })[];
};

/** Unified persisted data: workflow-relevant selections + UI view state. */
export type BlockData = {
  // Block label shown as the subtitle. `customBlockLabel` is the user-renamed override;
  // `defaultBlockLabel` holds the selected dataset's name, snapshotted by the UI on selection
  // (the `.subtitle` context is args-only and can't resolve the dataset label live).
  customBlockLabel?: string;
  defaultBlockLabel?: string;
  stateMatrixRef?: PlRef;
  /** Parent the plot is scoped to (UI auto-selects the first available on load). */
  selectedParentId?: string;
  /** Ordered per-round frequency columns; `[0]` = baseline R0. Empty = composition view off. */
  roundFrequencyRefs: SUniversalPColumnId[];
  /** Fraction-space epsilon for the composition ratio (default 1e-6). */
  compositionEpsilon: number;
  /** Ordered per-variant score columns for the mutation landscape. Empty = no map rendered. */
  scoreRefs: SUniversalPColumnId[];
} & BlockUiState;

/**
 * Default state for a mutation-landscape chart. Used by `init` for the placeholder and by the UI
 * for each score a run produces, so the two look alike.
 *
 * @param currentTab `"settings"` opens the Settings drawer, `null` leaves it closed
 */
export function makeLandscapeChartState(
  title: string,
  currentTab: "settings" | null,
): GraphMakerState {
  return {
    title,
    template: "heatmap",
    currentTab,
    // Cells are per-variant scores taken directly, not counts — GraphMaker's row z-score and
    // transform would both distort them, and the values arrive already normalized upstream.
    layersSettings: {
      heatmap: {
        normalizationDirection: null,
        transform: null,
        // The landscape's cell axes are declared dense, so the grid carries a record for every
        // (position, state) and the ones no single mutant covers arrive with no value. `null`
        // keeps those empty; the default of 0 would paint them as real cells at the bottom of
        // the colour scale, filling the map with substitutions that were never measured.
        NAValueAs: null,
      },
    },
    // Square cells, matching the enrichment map. No `facetColumns`: no facets left to lay out.
    axesSettings: {
      axisX: {
        cellSize: 20,
        // Two-part labels ("32, D": position, then the residue it started as) are too wide to sit
        // flat under a 20px column.
        axisLabelsAngle: 45,
      },
      axisY: {
        hideAxisLabels: false,
        cellSize: 20,
      },
    },
  };
}

/**
 * Default state for a drill-down's partner map. Same shape as a landscape chart — one colour
 * scale, no normalization, absent cells left empty — because it is the same map with one
 * mutation held fixed.
 */
/**
 * Pins "show empty rows/columns" on a drill-down chart.
 *
 * The partner map is sparse by nature — most positions carry no pair with the fixed mutation —
 * and without this it draws only the few positions that do. The region band beneath it then
 * shrinks to those, and the reader loses where in the parent they are looking. With the value
 * column's axes declared dense, the full grid arrives; this is what makes it render.
 */
function withEmptyCellsShown(state: GraphMakerState): GraphMakerState {
  return {
    ...state,
    layersSettings: {
      ...state.layersSettings,
      heatmap: {
        ...state.layersSettings?.heatmap,
        showEmptyRows: true,
        showEmptyColumns: true,
      },
    },
  };
}

export function makeDrillDownChartState(): GraphMakerState {
  // Empty title on purpose. The page header already names the substitution and the score, and
  // graph-maker would print the same thing again directly beneath it.
  return withEmptyCellsShown(makeLandscapeChartState("", null));
}

/**
 * Pins "Treat NA value as: empty" on a landscape chart's saved state.
 *
 * The landscape's cell axes are declared dense, so the grid now carries a record for every
 * (position, state) and the substitutions no single mutant covered arrive with no value. They
 * must stay empty. Seeding `makeLandscapeChartState` only reaches charts created from now on:
 * graph-maker writes its whole merged layer settings back into the state it is bound to, so any
 * chart opened before this change has the old default of 0 pinned in its own state, and would
 * paint every uncovered substitution as a real zero-valued cell.
 */
function withEmptyNAValue(state: GraphMakerState): GraphMakerState {
  return {
    ...state,
    layersSettings: {
      ...state.layersSettings,
      heatmap: { ...state.layersSettings?.heatmap, NAValueAs: null },
    },
  };
}

/**
 * The parent-residue column's key inside both heat-map frames, as it appears inside a saved
 * selector's source id. Distinct from the highlight flag's `parentFlag/isParentResidue`, which
 * contains this word too but not this path.
 */
const PARENT_RESIDUE_SOURCE = "parent/parentResidue";

const carriesParentResidue = (selectedSource: string) =>
  selectedSource.includes(PARENT_RESIDUE_SOURCE);

/**
 * Angles the X labels of a chart saved before the parent residue joined the axis, and moves the
 * source across.
 *
 * The move is belt and braces — graph-maker reapplies a default whose value has changed, so it
 * would arrive anyway — but the angle is not a default option. It lives in the chart's own axes
 * settings, which are seeded once when the chart is created, so without this an existing chart gets
 * the two-part label flat and overlapping under a 20px column.
 *
 * Keyed on the parent still being an annotation track, which is what "saved before this" looks
 * like. The region track is deliberately left where it is.
 */
export function withParentOnXAxis(state: GraphMakerState): GraphMakerState {
  const options = state.optionsState;
  if (options?.type !== "heatmap") {
    return state;
  }
  const annotations = options.components.annotationsX.selectorStates;
  const parent = annotations.find((selector) => carriesParentResidue(selector.selectedSource));
  if (!parent) {
    // No parent track to move — and no second label part, so tilting the labels would buy nothing.
    return state;
  }
  const alreadyOnX = options.components.x.selectorStates.some((selector) =>
    carriesParentResidue(selector.selectedSource),
  );
  return {
    ...state,
    optionsState: {
      ...options,
      components: {
        ...options.components,
        // Appended, so position stays the first part and the label reads in that order.
        x: alreadyOnX
          ? options.components.x
          : {
              type: "simple",
              selectorStates: [...options.components.x.selectorStates, parent],
            },
        annotationsX: {
          type: "simple",
          selectorStates: annotations.filter((selector) => selector !== parent),
        },
      },
    },
    axesSettings: {
      ...state.axesSettings,
      axisX: { ...state.axesSettings?.axisX, axisLabelsAngle: 45 },
    },
  };
}

/** Applies a rewrite to every chart state the block keeps. */
type ChartStates = Pick<
  BlockData,
  "compositionHeatmapState" | "singleMutantHeatmapState" | "singleMutantHeatmapStates"
>;

function mapChartStates(
  data: ChartStates,
  rewrite: (state: GraphMakerState) => GraphMakerState,
): ChartStates {
  return {
    compositionHeatmapState: rewrite(data.compositionHeatmapState),
    singleMutantHeatmapState: rewrite(data.singleMutantHeatmapState),
    singleMutantHeatmapStates: Object.fromEntries(
      Object.entries(data.singleMutantHeatmapStates).map(([key, state]) => [key, rewrite(state)]),
    ),
  };
}

const dataModel = new DataModelBuilder({ kind })
  .from<BlockDataV1>("v1")
  // Nothing to carry over: the v1 state described a chart that no longer exists.
  .migrate<BlockDataV2>("v2", (v1) => ({ ...v1, singleMutantHeatmapStates: {} }))
  .migrate<BlockDataV3>("v3", (v2) => ({
    ...v2,
    singleMutantHeatmapState: withEmptyNAValue(v2.singleMutantHeatmapState),
    singleMutantHeatmapStates: Object.fromEntries(
      Object.entries(v2.singleMutantHeatmapStates).map(([key, state]) => [
        key,
        withEmptyNAValue(state),
      ]),
    ),
  }))
  .migrate<BlockDataV4>("v4", (v3) => ({ ...v3, ...mapChartStates(v3, withParentOnXAxis) }))
  // Additive: a project made before per-position variant browsing simply has none open.
  .migrate<BlockDataV5>("v5", (v4) => ({ ...v4, drillDowns: [] }))
  // The page header names the drill-down now, so the chart below it must not repeat the name.
  // Charts created before that carry the designator as their own title and would print it twice.
  .migrate<BlockDataV6>("v6", (v5) => ({
    ...v5,
    drillDowns: v5.drillDowns.map((d) => ({
      ...d,
      heatmapState: { ...d.heatmapState, title: "" },
    })),
  }))
  // graph-maker writes its merged layer settings back into whatever state it is bound to, so a
  // drill-down chart opened before this keeps the old default of hiding empty rows and columns
  // and would draw only the positions carrying a pair. Same reason the `v3` migration had to
  // pin NAValueAs rather than rely on the seed.
  .migrate<BlockDataV7>("v7", (v6) => ({
    ...v6,
    drillDowns: v6.drillDowns.map((d) => ({
      ...d,
      heatmapState: withEmptyCellsShown(d.heatmapState),
    })),
  }))
  // Collapse the per-drill-down chart and table states onto one of each. The first drill-down's
  // settings win — they are all the same chart, so any of them is as good, and taking one keeps
  // whatever the user had adjusted rather than resetting to defaults.
  .migrate<BlockData>("v8", (v7) => {
    const first = v7.drillDowns[0];
    return {
      ...v7,
      drillDownChartState: first?.heatmapState ?? makeDrillDownChartState(),
      drillDownTableState: first?.tableState ?? createPlDataTableStateV2(),
      drillDowns: v7.drillDowns.map(({ mutationId, scoreKey, tab }) => ({
        mutationId,
        scoreKey,
        tab,
      })),
    };
  })
  .init(() => ({
    drillDowns: [],
    drillDownChartState: makeDrillDownChartState(),
    drillDownTableState: createPlDataTableStateV2(),
    roundFrequencyRefs: [],
    compositionEpsilon: 1e-6,
    scoreRefs: [],
    // The landing page opens with the Settings drawer out: a fresh block has nothing to plot,
    // and Settings is the first thing the user needs. The page closes it when a run starts.
    singleMutantHeatmapState: makeLandscapeChartState("Single Mutation Landscape", "settings"),
    singleMutantHeatmapStates: {},
    compositionHeatmapState: {
      title: "Enrichment Analysis",
      template: "heatmap",
      currentTab: null,
      // Value is log2 fold change (signed); the diverging palette is applied via the
      // GraphMaker `defaultPalette` prop on the page. Disable GraphMaker's own row
      // normalization and transform so the linear log2FC is shown as-is.
      layersSettings: {
        heatmap: {
          normalizationDirection: null,
          transform: null,
        },
      },
      // Square cells on the position axis, matching the enrichment map.
      axesSettings: {
        // One facet per row. The pinned cellSize below lays the cell grid out at its natural
        // size across the whole position range, but graph-maker's default facet grid is 3
        // columns, so each panel frame gets a third of the width. The two disagree and the grid
        // spills across and past the frames. Stacking the facets gives every panel the full
        // width, so the pin and the frame agree, and panels line up position-for-position —
        // which is the point of comparing them. The chart grows downward and scrolls, the same
        // trade already taken on Y.
        other: {
          facetColumns: 1,
        },
        axisX: {
          cellSize: 20,
          // Two-part labels ("32, D": position, then the residue it started as).
          axisLabelsAngle: 45,
        },
        axisY: {
          hideAxisLabels: false,
          cellSize: 20,
        },
      },
    },
  }));

export const platforma = BlockModelV3.create({ dataModel, kind })

  .args<BlockArgs>((data) => {
    if (data.stateMatrixRef === undefined) {
      throw new Error("Select a state-matrix column to render");
    }
    // Required: the plot is always scoped to one parent, so the workflow never runs over all
    // parents (which would make the position-keyed region/parent tracks a cross-parent mixture).
    // The UI auto-selects the first parent from the pool, so this is set within a moment of
    // choosing a state matrix; until then the block stays uncalculated, like the other inputs.
    if (data.selectedParentId === undefined) {
      throw new Error("Select a parent");
    }
    return {
      stateMatrixRef: data.stateMatrixRef,
      selectedParentId: data.selectedParentId,
      // Order is meaningful (baseline first) — pass through verbatim, do not sort.
      roundFrequencyRefs: data.roundFrequencyRefs ?? [],
      compositionEpsilon: data.compositionEpsilon ?? 1e-6,
      // Order is the facet order the user arranged — pass through verbatim, do not sort.
      scoreRefs: data.scoreRefs ?? [],
    };
  })

  // The inverse of the data model's `init`. The kind declares no params (see
  // `kind/src/index.ts`), so there is nothing to project and a project exported as a
  // template brings this block back default-initialized — the dataset and every setting
  // are re-picked by hand. Widening this is a deliberate follow-up, not an oversight: the
  // `PlRef` fields and the four scalar knobs are templatable, while the discovered
  // `SUniversalPColumnId` selections (property, scores, round frequencies) are anchored
  // against one project's upstream columns and the SDK promises template rewriting for
  // `PlRef` only.
  .templateParams(() => ({}))

  // --- Input selection from the result pool ---

  // Dataset picker: show the dataset (trace) label, like other blocks (e.g.
  // clonotype-clustering), not the column's native label ("Mutation State aa").
  // aa and nt state matrices share the name + dataset label, distinguished only by the
  // pl7.app/alphabet domain — so when one dataset exposes both, append a compact (aa)/(nt)
  // suffix to keep the options unique; otherwise leave the plain dataset name.
  .output("stateMatrixOptions", (ctx) => {
    const options = ctx.resultPool.getOptions([{ name: STATE_MATRIX }], {
      label: { includeNativeLabel: false },
    });
    const labelCounts = new Map<string, number>();
    for (const o of options) labelCounts.set(o.label, (labelCounts.get(o.label) ?? 0) + 1);
    return options.map((o) => {
      if ((labelCounts.get(o.label) ?? 0) <= 1) return o;
      const alphabet = ctx.resultPool
        .getPColumnSpecByRef(o.ref)
        ?.axesSpec.find((a) => a.domain?.["pl7.app/alphabet"])?.domain?.["pl7.app/alphabet"];
      const suffix = alphabet === "aminoacid" ? " (aa)" : alphabet === "nucleotide" ? " (nt)" : "";
      return { ...o, label: o.label + suffix };
    });
  })

  // Per-variant numeric score columns for the mutation landscape. Discovered via
  // discover() (not getCanonicalOptions — see roundFrequencyOptions for why) anchored on the
  // state matrix. The anchor name `main` must match the workflow's `bb.addAnchor(...)`.
  //
  // Numeric only — a cell holds one variant's score. NOT restricted to `pl7.app/isScore`: no
  // shipped block emits a variant-keyed column carrying that annotation yet (repertoire-score is
  // clonotype-keyed), so filtering on it would leave the dropdown empty. Revisit once the
  // bin-score block lands.
  .output("scoreOptions", (ctx) => {
    const stateMatrixRef = ctx.data.stateMatrixRef;
    if (stateMatrixRef === undefined) return undefined;
    const stateSpec = ctx.resultPool.getPColumnSpecByRef(stateMatrixRef);
    if (!stateSpec) return undefined;

    const anchors: Record<string, PColumnSpec> = { main: stateSpec };

    // The result pool is handed over whole (the `"result_pool"` shorthand) rather than
    // pre-filtered column by column. Linkers are dropped host-side; File-valued columns
    // cannot be named in a selector, and the numeric check below already excludes them.
    const columns = ColumnsCollection(["result_pool"])
      .discover({
        anchors,
        mode: "enrichment",
        maxHops: 0,
        exclude: [{ annotations: { "pl7.app/isLinkerColumn": exactMatch("true") } }],
      })
      .getColumns();

    const numeric = new Set(["Int", "Long", "Float", "Double"]);
    const seen = new Set<string>();
    const options: { label: string; value: SUniversalPColumnId }[] = [];
    for (const recipe of columns) {
      const spec = recipe.getSpec();
      if (!numeric.has(spec.valueType as string)) continue;
      // Dedup reachability variants of one column (by identity, not anchored id).
      const dedupKey = spec.name + "|" + JSON.stringify(spec.domain ?? {});
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      options.push({
        label: (spec.annotations?.["pl7.app/label"] as string | undefined) ?? recipe.id,
        value: recipe.id as SUniversalPColumnId,
      });
    }
    return options;
  })

  // Per-round frequency columns from the enrichment block (composition-enrichment view).
  // Each round is one `pl7.app/frequency` column carrying its round identity in domain
  // `pl7.app/enrichment/condition`. The user orders the chosen rounds in the UI
  // (baseline = first); the workflow reads each round's identity from that domain.
  //
  // Discovered via ColumnsCollection.discover anchored on the STATE MATRIX, the same anchor the
  // score columns use. These columns are keyed on `pl7.app/variantKey` alone — the round lives in
  // the domain, not on an axis — and the state matrix carries that axis at idx 0, so it anchors
  // them directly. `discover` resolves via the spec frame, unlike
  // `getCanonicalOptions` — whose id bakes in the enrichment column's nested-escaped-JSON domains
  // (conditionsOrder / filteringConfig), which fail to round-trip in the workflow's anchored
  // query. The anchor name `main` must match the workflow's `bb.addAnchor("main", ...)`; the
  // discovered `column.id` resolves against it there.
  //
  // v1: variant-level only (maxHops 0). Cluster-keyed frequencies (enrichment on clustered
  // abundance) need linker traversal (maxHops > 0) + adding the `variant→cluster` linker in
  // the workflow (A-0016) — deferred, shared with the property-view cluster path.
  .output("roundFrequencyOptions", (ctx) => {
    const stateMatrixRef = ctx.data.stateMatrixRef;
    if (stateMatrixRef === undefined) return undefined;
    const stateSpec = ctx.resultPool.getPColumnSpecByRef(stateMatrixRef);
    if (!stateSpec) return undefined;

    const matches = dedupByLeafId(
      ColumnsCollection(["result_pool"])
        .discover({
          include: { name: exactMatch("pl7.app/frequency") },
          anchors: { main: stateSpec },
          mode: "enrichment",
          maxHops: 0,
        })
        .getColumns(),
    );

    return matches.map((recipe) => {
      const spec = recipe.getSpec();
      return {
        label: (spec.annotations?.["pl7.app/label"] as string | undefined) ?? recipe.id,
        value: recipe.id as SUniversalPColumnId,
      };
    });
  })

  // State-matrix column as a pframe + its id — available straight from the result pool, before
  // the main workflow runs. The UI reads the parentId axis (idx 1) off it via
  // getUniqueSourceValuesWithLabels to populate the parent selector; the chosen parent then
  // scopes the whole plot. Pool-derived (not a workflow output), so it's an input option and the
  // auto-select of the first parent can't loop back into it.
  .output("stateMatrixPf", (ctx) => {
    const { stateMatrixRef } = ctx.data;
    if (stateMatrixRef === undefined) return undefined;
    const col = ctx.resultPool.getPColumnByRef(stateMatrixRef);
    if (col === undefined) return undefined;
    return ctx.createPFrame([col]);
  })
  .output("stateMatrixColId", (ctx) => {
    const { stateMatrixRef } = ctx.data;
    if (stateMatrixRef === undefined) return undefined;
    return ctx.resultPool.getPColumnByRef(stateMatrixRef)?.id;
  })

  // --- Heat map outputs (filled by the workflow) ---

  // Single-mutant landscape: one value column per score, each `[position, state] -> cellValue`,
  // plus the two position-keyed annotation tracks. One frame serves every chart — a chart reads
  // only the value column it is given. Present only when score columns are selected AND the
  // profiler emitted a mutation count (the workflow emits it conditionally).
  .outputWithStatus("singleMutantHeatmapPf", (ctx): PFrameHandle | undefined => {
    const pCols = outputPColumns(ctx, "singleMutantHeatmapPf");
    if (pCols === undefined) return undefined;
    return createPFrameForGraphs(ctx, pCols);
  })
  .output("singleMutantHeatmapPCols", (ctx) => {
    return outputPColumns(ctx, "singleMutantHeatmapPf");
  })

  // One chart per score column the last run produced, in the user's score order. Read from the
  // produced columns, not `data.scoreRefs`: while the block is stale the two disagree, and the
  // columns are what is actually on screen.
  .output("landscapePanels", (ctx): LandscapePanel[] | undefined =>
    landscapePanelsFrom(outputPColumns(ctx, "singleMutantHeatmapPf")),
  )

  // --- Drill-down outputs (per-position variant browsing) ---

  // Partner map: [mutationId, position, state] -> cellValue, one value column per score, plus
  // the fixed-cell flag and the two position-keyed tracks. One frame serves every open
  // drill-down — the chart pins `mutationId` to its own substitution.
  .outputWithStatus("drillDownHeatmapPf", (ctx): PFrameHandle | undefined => {
    const pCols = outputPColumns(ctx, "drillDownHeatmapPf");
    if (pCols === undefined) return undefined;
    return createPFrameForGraphs(ctx, pCols);
  })
  .output("drillDownHeatmapPCols", (ctx) => {
    return outputPColumns(ctx, "drillDownHeatmapPf");
  })

  // [mutationId] -> co-occurring variant count, present only for substitutions that HAVE a
  // co-occurring variant. The UI enumerates this frame's axis to list what is worth browsing —
  // which is exactly the set of cells a click will be allowed to open.
  .output("browsableMutationsPf", (ctx) => {
    const pCols = outputPColumns(ctx, "browsableMutationsPf");
    if (pCols === undefined || pCols.length === 0) return undefined;
    return ctx.createPFrame(pCols);
  })
  .output("browsableMutationsColId", (ctx) => {
    return outputPColumns(ctx, "browsableMutationsPf")?.find(
      (c) => c.spec.name === BROWSABLE_MUTATION,
    )?.id;
  })

  // Table tab: every variant carrying the active drill-down's substitution, at any mutation
  // count. The block exports only the [variantKey, mutationId] linker as the primary column;
  // sequence, mutations, mutation count, abundance and the scores are joined in from the result
  // pool on the shared variantKey axis, so none of them is copied into this block's own exports
  // and the user can surface any other variant-keyed column later.
  .outputWithStatus("drillDownTable", (ctx) => {
    const mutationId = ctx.data.activeDrillDown;
    if (mutationId === undefined) return undefined;

    const linkCols = outputPColumns(ctx, "mutationVariantLinkPf");
    const linker = linkCols?.find((c) => c.spec.name === MUTATION_VARIANT_LINK);
    if (linker === undefined) return undefined;

    // Axis order is the workflow's: variantKey at 0 (what the secondaries join on), mutationId
    // at 1 (what the filter pins).
    const mutationAxis = linker.spec.axesSpec.find((a) => a.name === MUTATION_ID_AXIS);
    if (mutationAxis === undefined) return undefined;

    const stateMatrixRef = ctx.data.stateMatrixRef;
    if (stateMatrixRef === undefined) return undefined;
    const stateSpec = ctx.resultPool.getPColumnSpecByRef(stateMatrixRef);
    if (!stateSpec) return undefined;

    // Everything the profiler and the upstream blocks key on variantKey ALONE. Linkers are
    // excluded — they are the hop, not a column to show.
    //
    // The axis check is what keeps the table honest, and it is not optional. A zero-hop
    // discovery also reaches columns carrying axes the linker does not: the state matrix is
    // `[variantKey, parentId, position]` and the region track is `[parentId, position]`.
    // Joining either adds a position axis, and one variant becomes one row PER POSITION — ~110x,
    // which turned a few hundred variants into 66,220 rows of the same variant repeated.
    //
    // Per-sample columns are excluded by the same rule. They belong in sheets rather than rows;
    // until that exists, an abundance split by sample is left out rather than multiplying the
    // table by the sample count.
    const secondary = dedupByLeafId(
      ColumnsCollection(["result_pool"])
        .discover({
          anchors: { main: stateSpec },
          mode: "enrichment",
          maxHops: 0,
          exclude: [{ annotations: { "pl7.app/isLinkerColumn": exactMatch("true") } }],
        })
        .getColumns(),
    ).filter((recipe) => {
      const axes = recipe.getSpec().axesSpec;
      return axes.length === 1 && axes[0].name === VARIANT_KEY_AXIS;
    });

    return createPlDataTableV3(ctx, {
      primaryColumns: [DataColumn.fromColumn(linker)],
      columns: secondary,
      // Model-side default, so the table opens already scoped to the browsed substitution
      // instead of showing the whole membership map for an instant.
      filters: {
        type: "and",
        filters: [
          {
            type: "patternEquals",
            column: {
              type: "axis",
              id: { name: mutationAxis.name, type: mutationAxis.type, domain: mutationAxis.domain },
            },
            value: mutationId,
          },
        ],
      },
      tableState: ctx.data.drillDownTableState,
    });
  })

  // Composition-enrichment heat map: per-round positional log2 fold change
  // `[round, parentId, position, state] -> log2FC`. Present only when round-frequency
  // inputs are selected (the workflow emits it conditionally).
  .outputWithStatus("compositionHeatmapPf", (ctx): PFrameHandle | undefined => {
    const pCols = outputPColumns(ctx, "compositionHeatmapPf");
    if (pCols === undefined) return undefined;
    return createPFrameForGraphs(ctx, pCols);
  })
  .output("compositionHeatmapPCols", (ctx) => {
    return outputPColumns(ctx, "compositionHeatmapPf");
  })

  .output("isRunning", (ctx) => ctx.outputs?.getIsReadyOrError() === false)

  .title(() => "Mutation Explorer")

  // Subtitle: custom label if the user renamed the block, else the selected dataset's name
  // (snapshotted into data by the UI on selection), else a prompt. The subtitle context is
  // args-only — it can't resolve the dataset label live — so the name must already be in data.
  .subtitle((ctx) => ctx.data.customBlockLabel || ctx.data.defaultBlockLabel || NO_DATASET_LABEL)

  .sections((ctx) => {
    const pCols = outputPColumns(ctx, "singleMutantHeatmapPf");
    const panels = landscapePanelsFrom(pCols) ?? [];

    // A section is one line of text: no subtitle, no indentation, and a delimiter carries no
    // label. Grouping is therefore the only way to say what a run of entries is, which is why
    // every landscape entry repeats "Landscape". Rules go BETWEEN groups only — a leading one
    // would sit directly under the block header, which already divides them.
    const sections: (
      | { type: "link"; href: `/${string}`; label: string }
      | { type: "delimiter" }
    )[] = [];

    if (panels.length === 0) {
      // Nothing produced yet. "/" is still listed, because it carries the empty state and its
      // Settings drawer — on a fresh block it is the only way to pick a dataset at all.
      sections.push({ type: "link", href: "/", label: "Single Mutation Landscape" });
    } else {
      // One page per score, rather than one page with a tab per score: a run can select many
      // scores, and a tab strip stops being navigable long before a section list does.
      for (const p of panels) {
        sections.push({ type: "link", href: landscapeHref(p.key), label: landscapeLabel(p.label) });
      }
    }

    // One per open drill-down, in the order they were opened. Read from `data`, so a section
    // appears the moment a substitution is browsed into — no Run, and nothing goes stale.
    const drillDowns = ctx.data.drillDowns ?? [];
    if (drillDowns.length > 0) {
      const scoreLabels = scoreLabelsByKey(pCols);
      sections.push({ type: "delimiter" });
      for (const d of drillDowns) {
        sections.push({
          type: "link",
          href: drillDownHref(d.mutationId),
          label: drillDownLabel(d.mutationId, scoreLabels[d.scoreKey]),
        });
      }
    }

    // Needs a baseline + at least one comparison round (see workflow's hasComposition).
    if (ctx.data.roundFrequencyRefs.length >= 2) {
      sections.push({ type: "delimiter" });
      sections.push({ type: "link", href: "/composition", label: "Enrichment Analysis" });
    }
    return sections;
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
