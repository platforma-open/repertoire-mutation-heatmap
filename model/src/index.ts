import type { GraphMakerState } from "@milaboratories/graph-maker";
import type {
  InferOutputsType,
  PFrameHandle,
  PlRef,
  SUniversalPColumnId,
} from "@platforma-sdk/model";
import { BlockModelV3, DataModelBuilder, createPFrameForGraphs } from "@platforma-sdk/model";

// Profiler spec names used as join keys — must stay byte-identical to the names the profiler emits.
const STATE_MATRIX = "pl7.app/repertoire/stateMatrix";
const VARIANT_KEY_AXIS = "pl7.app/variantKey";
const KNOWN_VARIANT_KEY_AXIS = "pl7.app/knownVariantKey";
const SAMPLE_ID_AXIS = "pl7.app/sampleId";

/** Sequence alphabet of the state matrix / variant axis. */
export type Alphabet = "aminoacid" | "nucleotide";

/** Cell colour: summed abundance, or averaged per-variant property. */
export type ValueMode = "abundance" | "property";

/** Variant-subset membership filter. */
export type Membership = "all" | "known";

/**
 * Variant-subset filter applied before aggregation.
 * Changing it re-runs the precalc workflow over the new subset.
 */
export type VariantFilter = {
  /** Per-variant property column to filter on (e.g. a Tite-Seq Kd). */
  propertyRef?: SUniversalPColumnId;
  /** Inclusive [min, max] range over `propertyRef`; null = unbounded. */
  range?: [number | null, number | null];
  /** Samples/rounds to restrict to; empty/undefined = all samples. */
  sampleSelection?: string[];
  /** Keep all variants, or only those assigned to a known variant. */
  membership: Membership;
};

/** Workflow-facing args, derived from `BlockData`. */
export type BlockArgs = {
  /** Profiler state matrix `[variantKey, parentId, position] -> state`. */
  stateMatrixRef: PlRef;
  /** Per-sample abundance `[sampleId, variantKey]` (required in abundance mode). */
  abundanceRef?: PlRef;
  /** Per-variant property `[variantKey] -> value` (required in property mode). */
  propertyRef?: SUniversalPColumnId;
  /** Pre-aggregated known×sample abundance `[sampleId, knownVariantKey]` (heat map 2). */
  knownAbundanceRef?: PlRef;
  level: Alphabet;
  valueMode: ValueMode;
  /** Per-(parent, position) frequency normalization (abundance mode only). */
  normalize: boolean;
  filter: VariantFilter;
};

/** UI view state kept out of the workflow args. */
export type BlockUiState = {
  stateHeatmapState: GraphMakerState;
  knownHeatmapState: GraphMakerState;
};

/** Unified persisted data: workflow-relevant selections + UI view state. */
export type BlockData = {
  stateMatrixRef?: PlRef;
  abundanceRef?: PlRef;
  propertyRef?: SUniversalPColumnId;
  knownAbundanceRef?: PlRef;
  level: Alphabet;
  valueMode: ValueMode;
  normalize: boolean;
  filter: VariantFilter;
} & BlockUiState;

/** Strip empty bounds / empty selection; lex-sort samples for a stable cache key. */
function canonicalizeFilter(f: VariantFilter): VariantFilter {
  const out: VariantFilter = { membership: f.membership ?? "all" };
  if (f.propertyRef) out.propertyRef = f.propertyRef;
  if (f.range && (f.range[0] != null || f.range[1] != null)) {
    out.range = [f.range[0] ?? null, f.range[1] ?? null];
  }
  if (f.sampleSelection && f.sampleSelection.length > 0) {
    out.sampleSelection = [...f.sampleSelection].sort();
  }
  return out;
}

const dataModel = new DataModelBuilder().from<BlockData>("v1").init(() => ({
  level: "aminoacid" as const,
  valueMode: "abundance" as const,
  normalize: true,
  filter: { membership: "all" as const },
  stateHeatmapState: {
    title: "Deep Mutational Scanning",
    template: "heatmap",
    // Start with the Settings drawer open; MainPage closes it when a run starts.
    currentTab: "settings",
    // GraphMaker defaults heatmaps to row z-score (standardScaling), turning cells
    // below their row mean negative. The default view is per-position state
    // frequency (normalize=true, computed in the workflow) on a linear 0–1 scale,
    // so disable GraphMaker's own normalization and transform.
    layersSettings: {
      heatmap: {
        normalizationDirection: null,
        transform: null,
      },
    },
    // Show the Y (state) axis labels by default, and give each state row a fixed
    // height so the labels have room to render — the state alphabet is large
    // (single residues + multi-residue insertions + gap/stop), so auto-fit
    // squeezes rows too thin to label. The chart grows tall and scrolls.
    axesSettings: {
      axisY: {
        hideAxisLabels: false,
        cellSize: 20,
      },
    },
  },
  knownHeatmapState: {
    title: "Known variant abundance",
    template: "heatmap",
    currentTab: null,
    layersSettings: {
      heatmap: {
        normalizationDirection: null,
        transform: null,
      },
    },
    // Show known-variant labels on Y with a fixed row height (the known set can be
    // large), matching the state heat map.
    axesSettings: {
      axisY: {
        hideAxisLabels: false,
        cellSize: 20,
      },
    },
  },
}));

export const platforma = BlockModelV3.create(dataModel)

  .args<BlockArgs>((data) => {
    if (data.stateMatrixRef === undefined) {
      throw new Error("Select a state-matrix column to render");
    }
    if (data.valueMode === "abundance" && data.abundanceRef === undefined) {
      throw new Error("Abundance value-mode requires an abundance column");
    }
    if (data.valueMode === "property" && data.propertyRef === undefined) {
      throw new Error("Property value-mode requires a per-variant property column");
    }
    return {
      stateMatrixRef: data.stateMatrixRef,
      abundanceRef: data.abundanceRef,
      propertyRef: data.valueMode === "property" ? data.propertyRef : undefined,
      knownAbundanceRef: data.knownAbundanceRef,
      level: data.level,
      valueMode: data.valueMode,
      normalize: data.valueMode === "abundance" ? data.normalize : false,
      filter: canonicalizeFilter(data.filter),
    };
  })

  // --- Input selection from the result pool ---

  // aa and nt state matrices both surface, distinguished by the pl7.app/alphabet
  // domain on the variant/position axes; the native label shows which.
  .output("stateMatrixOptions", (ctx) =>
    ctx.resultPool.getOptions([{ name: STATE_MATRIX }], {
      label: { includeNativeLabel: true },
    }),
  )

  // Per-sample, per-variant abundance `[sampleId, variantKey]`. The 2-axis filter
  // excludes the known-level `[sampleId, knownVariantKey]` abundance.
  .output("abundanceOptions", (ctx) =>
    ctx.resultPool.getOptions(
      [
        {
          axes: [{ name: SAMPLE_ID_AXIS }, { name: VARIANT_KEY_AXIS }],
          annotations: { "pl7.app/isAbundance": "true" },
        },
      ],
      { label: { includeNativeLabel: true } },
    ),
  )

  // Per-variant property columns `[variantKey] -> value`, anchored on the chosen
  // state matrix's variant axis (idx 0). Sourced from an upstream affinity block,
  // joined on variantKey. Values are SUniversalPColumnId (round-trip via stateMatrixRef).
  .output("propertyOptions", (ctx) => {
    const anchor = ctx.data.stateMatrixRef;
    if (anchor === undefined) return undefined;
    return ctx.resultPool.getCanonicalOptions({ main: anchor }, [
      { axes: [{ anchor: "main", idx: 0 }] },
    ]);
  })

  // Pre-aggregated known×sample abundance `[sampleId, knownVariantKey]` (heat map 2).
  .output("knownAbundanceOptions", (ctx) =>
    ctx.resultPool.getOptions(
      [
        {
          axes: [{ name: SAMPLE_ID_AXIS }, { name: KNOWN_VARIANT_KEY_AXIS }],
          annotations: {
            "pl7.app/isAbundance": "true",
            "pl7.app/abundance/aggregated": "true",
          },
        },
      ],
      { label: { includeNativeLabel: true } },
    ),
  )

  // Spec of the chosen state matrix (UI: surface alphabet / position axis, validation).
  .output("stateMatrixSpec", (ctx) =>
    ctx.data.stateMatrixRef
      ? ctx.resultPool.getPColumnSpecByRef(ctx.data.stateMatrixRef)
      : undefined,
  )

  // Sample-label column (keyed [sampleId]) anchored on the abundance column's
  // sampleId axis — feeds the sample-selection multiselect. The UI reads this via
  // getSingleColumnData to enumerate {sampleId, label} for the filter.
  .output("sampleLabelPframe", (ctx) => {
    const { abundanceRef } = ctx.data;
    if (abundanceRef === undefined) return undefined;
    const cols = ctx.resultPool.getAnchoredPColumns({ main: abundanceRef }, [
      { axes: [{ anchor: "main", idx: 0 }], name: "pl7.app/label" },
    ]);
    if (!cols || cols.length === 0) return undefined;
    return ctx.createPFrame(cols);
  })
  .output("sampleLabelColId", (ctx) => {
    const { abundanceRef } = ctx.data;
    if (abundanceRef === undefined) return undefined;
    const cols = ctx.resultPool.getAnchoredPColumns({ main: abundanceRef }, [
      { axes: [{ anchor: "main", idx: 0 }], name: "pl7.app/label" },
    ]);
    return cols?.[0]?.id;
  })

  // --- Heat map outputs (filled by the workflow) ---

  // Heat map 1: state-matrix enrichment precalc result `[parentId, position, state] -> value`.
  // GraphMaker's :p-frame requires the with-status wrapper.
  .outputWithStatus("stateHeatmapPf", (ctx): PFrameHandle | undefined => {
    try {
      const pCols = ctx.outputs?.resolve("stateHeatmapPf")?.getPColumns();
      if (pCols === undefined) return undefined;
      return createPFrameForGraphs(ctx, pCols);
    } catch {
      return undefined;
    }
  })
  .output("stateHeatmapPCols", (ctx) => {
    try {
      return ctx.outputs?.resolve("stateHeatmapPf")?.getPColumns();
    } catch {
      return undefined;
    }
  })

  // Heat map 2: known×sample abundance, rendered DIRECTLY from the result pool
  // (no precalc — the profiler already aggregated it to [sampleId, knownVariantKey]).
  // Anchored on the chosen abundance ref: returns the aggregated count + fraction
  // columns; createPFrameForGraphs pulls in the related known-variant label column.
  .outputWithStatus("knownHeatmapPf", (ctx): PFrameHandle | undefined => {
    const { knownAbundanceRef } = ctx.data;
    if (knownAbundanceRef === undefined) return undefined;
    try {
      const cols = ctx.resultPool.getAnchoredPColumns({ main: knownAbundanceRef }, [
        {
          axes: [
            { anchor: "main", idx: 0 },
            { anchor: "main", idx: 1 },
          ],
          annotations: { "pl7.app/isAbundance": "true", "pl7.app/abundance/aggregated": "true" },
        },
      ]);
      if (!cols || cols.length === 0) return undefined;
      return createPFrameForGraphs(ctx, cols);
    } catch {
      return undefined;
    }
  })
  .output("knownHeatmapPCols", (ctx) => {
    const { knownAbundanceRef } = ctx.data;
    if (knownAbundanceRef === undefined) return undefined;
    try {
      return ctx.resultPool.getAnchoredPColumns({ main: knownAbundanceRef }, [
        {
          axes: [
            { anchor: "main", idx: 0 },
            { anchor: "main", idx: 1 },
          ],
          annotations: { "pl7.app/isAbundance": "true", "pl7.app/abundance/aggregated": "true" },
        },
      ]);
    } catch {
      return undefined;
    }
  })

  .output("isRunning", (ctx) => ctx.outputs?.getIsReadyOrError() === false)

  .title(() => "Deep Mutational Scanning")

  // Main page is the mutation-enrichment heat map itself (GraphMaker hosts the
  // settings form). The known×sample heat map gets its own page.
  .sections((ctx) => {
    const sections: { type: "link"; href: `/${string}`; label: string }[] = [
      { type: "link", href: "/", label: "Mutation Heatmap" },
    ];
    if (ctx.data.knownAbundanceRef !== undefined) {
      sections.push({ type: "link", href: "/known-heatmap", label: "Known Variants" });
    }
    return sections;
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
