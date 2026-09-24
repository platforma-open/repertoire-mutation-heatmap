import type { GraphMakerState } from "@milaboratories/graph-maker";
import type { BlockData } from "./types";

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
 * The key a chart's saved aesthetic mapping uses for the region track, as it appears inside
 * `dataBindAes`. The source id embeds the column's resolve path, so this matches it in both
 * frames at once.
 */
const REGION_AES_SOURCE = "region/region";

/**
 * Drops a chart's saved colour mapping for the region track, so it is seeded afresh.
 *
 * graph-maker reads the `pl7.app/graph/palette` annotation ONCE, when a mapping is created, and
 * never reasserts it — "after that the mapping is the user's". A chart that already built its own
 * mapping therefore keeps it, whatever the column now declares. Clearing the entry is the only
 * way to let the pinned palette take effect on a chart that predates it.
 */
export function withRegionColoursReseeded(state: GraphMakerState): GraphMakerState {
  const aes = (state as { dataBindAes?: Record<string, unknown> }).dataBindAes;
  if (aes === undefined) return state;
  const kept = Object.fromEntries(
    Object.entries(aes).filter(([source]) => !source.includes(REGION_AES_SOURCE)),
  );
  return { ...state, dataBindAes: kept } as GraphMakerState;
}

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
  const base = withEmptyCellsShown(makeLandscapeChartState("", null));
  return {
    ...base,
    axesSettings: {
      ...base.axesSettings,
      // Hidden, not merely empty: an empty title still reserves its band above the plot, so the
      // drill-down drew a blank strip between the PlBlockPage header and the map.
      //
      // Only here. A landscape page has NO PlBlockPage header — graph-maker's own title is its
      // page heading, and MutationLandscapePage renders the score tabs into the title-line slot
      // beside it. Hiding it there would take the heading and the tabs with it.
      title: { ...base.axesSettings?.title, mode: "hidden" },
    },
  };
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
export function withEmptyNAValue(state: GraphMakerState): GraphMakerState {
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

export function mapChartStates(
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
