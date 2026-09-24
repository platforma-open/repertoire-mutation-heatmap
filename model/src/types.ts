import type { GraphMakerState } from "@milaboratories/graph-maker";
import type {
  PColumnSpec,
  PlDataTableStateV2,
  PlRef,
  SUniversalPColumnId,
} from "@platforma-sdk/model";

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
  BlockData,
  "drillDowns" | "activeDrillDown" | "drillDownChartState" | "drillDownTableState"
>;

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
