import type { GraphMakerState } from "@milaboratories/graph-maker";
import type {
  InferOutputsType,
  PColumnSpec,
  PFrameHandle,
  PlRef,
  SUniversalPColumnId,
} from "@platforma-sdk/model";
import {
  BlockModelV3,
  ColumnCollectionBuilder,
  DataModelBuilder,
  createPFrameForGraphs,
} from "@platforma-sdk/model";

// Profiler spec names used as join keys — must stay byte-identical to the names the profiler emits.
const STATE_MATRIX = "pl7.app/repertoire/stateMatrix";
const VARIANT_KEY_AXIS = "pl7.app/variantKey";
const KNOWN_VARIANT_KEY_AXIS = "pl7.app/knownVariantKey";
const SAMPLE_ID_AXIS = "pl7.app/sampleId";

// Subtitle fallback when no dataset is selected yet.
const NO_DATASET_LABEL = "No dataset selected";

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
  /** Parent to scope the whole plot to. Required — the args projection throws until it is set
   *  (the UI auto-selects the first parent), so the workflow only ever runs single-parent. */
  selectedParentId: string;
  /** Per-sample abundance `[sampleId, variantKey]` (required in abundance mode). */
  abundanceRef?: PlRef;
  /** Per-variant property `[variantKey] -> value` (required in property mode). */
  propertyRef?: SUniversalPColumnId;
  /** Pre-aggregated known×sample abundance `[sampleId, knownVariantKey]` (heat map 2). */
  knownAbundanceRef?: PlRef;
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
  compositionHeatmapState: GraphMakerState;
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
  abundanceRef?: PlRef;
  propertyRef?: SUniversalPColumnId;
  knownAbundanceRef?: PlRef;
  /** Ordered per-round frequency columns; `[0]` = baseline R0. Empty = composition view off. */
  roundFrequencyRefs: SUniversalPColumnId[];
  /** Fraction-space epsilon for the composition ratio (default 1e-6). */
  compositionEpsilon: number;
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
  roundFrequencyRefs: [],
  compositionEpsilon: 1e-6,
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
    // Required: the plot is always scoped to one parent, so the workflow never runs over all
    // parents (which would make the position-keyed region/parent tracks a cross-parent mixture).
    // The UI auto-selects the first parent from the pool, so this is set within a moment of
    // choosing a state matrix; until then the block stays uncalculated, like the other inputs.
    if (data.selectedParentId === undefined) {
      throw new Error("Select a parent");
    }
    if (data.abundanceRef === undefined) {
      throw new Error("Select an abundance column");
    }
    return {
      stateMatrixRef: data.stateMatrixRef,
      selectedParentId: data.selectedParentId,
      abundanceRef: data.abundanceRef,
      // Value mode is always abundance — the UI no longer exposes the abundance/property
      // switch. The workflow retains the property path (dormant), so pin the mode here and
      // send no property ref regardless of any value persisted from an earlier version.
      propertyRef: undefined,
      knownAbundanceRef: data.knownAbundanceRef,
      level: data.level,
      valueMode: "abundance",
      normalize: data.normalize,
      filter: canonicalizeFilter(data.filter),
      // Order is meaningful (baseline first) — pass through verbatim, do not sort.
      roundFrequencyRefs: data.roundFrequencyRefs ?? [],
      compositionEpsilon: data.compositionEpsilon ?? 1e-6,
    };
  })

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

  // Per-sample, per-variant abundance `[sampleId, variantKey]`, scoped to the SELECTED dataset:
  // only columns whose variantKey axis matches the chosen state matrix's (same
  // pl7.app/repertoire/extractionRunId + pl7.app/alphabet, i.e. same profiler run and level) — so
  // the abundance joins the state matrix. Undefined until a dataset is picked, like the parent
  // selector. The 2-axis check excludes the known-level `[sampleId, knownVariantKey]` abundance.
  .output("abundanceOptions", (ctx) => {
    const { stateMatrixRef } = ctx.data;
    if (stateMatrixRef === undefined) return undefined;
    const stateSpec = ctx.resultPool.getPColumnSpecByRef(stateMatrixRef);
    if (!stateSpec) return undefined;
    const smVariantKey = stateSpec.axesSpec.find((a) => a.name === VARIANT_KEY_AXIS);
    if (!smVariantKey) return undefined;
    const runId = smVariantKey.domain?.["pl7.app/repertoire/extractionRunId"];
    const alphabet = smVariantKey.domain?.["pl7.app/alphabet"];
    return ctx.resultPool.getOptions(
      (spec) => {
        if (spec.kind !== "PColumn") return false;
        const s = spec as PColumnSpec;
        if (s.annotations?.["pl7.app/isAbundance"] !== "true") return false;
        if (s.axesSpec.length !== 2) return false;
        const vk = s.axesSpec.find((a) => a.name === VARIANT_KEY_AXIS);
        if (!vk || !s.axesSpec.some((a) => a.name === SAMPLE_ID_AXIS)) return false;
        return (
          vk.domain?.["pl7.app/repertoire/extractionRunId"] === runId &&
          vk.domain?.["pl7.app/alphabet"] === alphabet
        );
      },
      { label: { includeNativeLabel: true } },
    );
  })

  // Per-variant numeric property columns for the `property` value-mode and the
  // property-range filter. Discovered via findColumns (not getCanonicalOptions — see
  // roundFrequencyOptions for why) anchored on BOTH the state matrix (profiler-keyed
  // properties, e.g. mutations) and the abundance (enrichment-keyed properties). The
  // anchor names `main` / `freqAnchor` must match the workflow's `bb.addAnchor(...)`.
  // Numeric only (A-0015) — a mean of the property is what a cell shows.
  .output("propertyOptions", (ctx) => {
    const stateMatrixRef = ctx.data.stateMatrixRef;
    if (stateMatrixRef === undefined) return undefined;
    const stateSpec = ctx.resultPool.getPColumnSpecByRef(stateMatrixRef);
    if (!stateSpec) return undefined;

    const anchors: Record<string, PColumnSpec> = { main: stateSpec };
    const abundanceRef = ctx.data.abundanceRef;
    const abundanceSpec = abundanceRef
      ? ctx.resultPool.getPColumnSpecByRef(abundanceRef)
      : undefined;
    if (abundanceSpec) anchors.freqAnchor = abundanceSpec;

    const sourceColumns = ctx.resultPool.selectColumns(
      (spec) =>
        (spec.valueType as string) !== "File" &&
        !(spec.annotations?.["pl7.app/isLinkerColumn"] === "true" && spec.axesSpec.length > 2),
    );

    const collection = new ColumnCollectionBuilder(ctx.getService("pframeSpec"))
      .addSource(sourceColumns)
      .build({ anchors });
    if (!collection) return undefined;

    const numeric = new Set(["Int", "Long", "Float", "Double"]);
    const seen = new Set<string>();
    const options: { label: string; value: SUniversalPColumnId }[] = [];
    for (const m of collection.findColumns({ mode: "enrichment", maxHops: 0 })) {
      if (!numeric.has(m.column.spec.valueType as string)) continue;
      // Dedup a column reachable via both anchors (by identity, not anchored id).
      const dedupKey = m.column.spec.name + "|" + JSON.stringify(m.column.spec.domain ?? {});
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      options.push({
        label: (m.column.spec.annotations?.["pl7.app/label"] as string | undefined) ?? m.column.id,
        value: m.column.id as SUniversalPColumnId,
      });
    }
    return options;
  })

  // Per-round frequency columns from the enrichment block (composition-enrichment view).
  // Each round is one `pl7.app/frequency` column carrying its round identity in domain
  // `pl7.app/enrichment/condition`. The user orders the chosen rounds in the UI
  // (baseline = first); the workflow reads each round's identity from that domain.
  //
  // Discovered via ColumnCollectionBuilder.findColumns anchored on the ABUNDANCE ref (the
  // enrichment block keys these on `abundanceSpec.axesSpec[1]`). `findColumns` resolves via
  // the spec frame, unlike `getCanonicalOptions` — whose id bakes in the enrichment column's
  // nested-escaped-JSON domains (conditionsOrder / filteringConfig), which fail to round-trip
  // in the workflow's anchored query. The anchor name `freqAnchor` must match the workflow's
  // `bb.addAnchor("freqAnchor", ...)`; the discovered `column.id` resolves against it there.
  //
  // v1: variant-level only (maxHops 0). Cluster-keyed frequencies (enrichment on clustered
  // abundance) need linker traversal (maxHops > 0) + adding the `variant→cluster` linker in
  // the workflow (A-0016) — deferred, shared with the property-view cluster path.
  .output("roundFrequencyOptions", (ctx) => {
    const abundanceRef = ctx.data.abundanceRef;
    if (abundanceRef === undefined) return undefined;
    const anchorSpec = ctx.resultPool.getPColumnSpecByRef(abundanceRef);
    if (!anchorSpec) return undefined;

    // Exclude columns the WASM spec frame rejects (File value type; wide linkers).
    const sourceColumns = ctx.resultPool.selectColumns(
      (spec) =>
        (spec.valueType as string) !== "File" &&
        !(spec.annotations?.["pl7.app/isLinkerColumn"] === "true" && spec.axesSpec.length > 2),
    );

    const collection = new ColumnCollectionBuilder(ctx.getService("pframeSpec"))
      .addSource(sourceColumns)
      .build({ anchors: { freqAnchor: anchorSpec } });
    if (!collection) return undefined;

    const matches = collection.findColumns({
      include: { name: "pl7.app/frequency" },
      mode: "enrichment",
      maxHops: 0,
    });

    return matches.map((m) => ({
      label: (m.column.spec.annotations?.["pl7.app/label"] as string | undefined) ?? m.column.id,
      value: m.column.id as SUniversalPColumnId,
    }));
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

  // Composition-enrichment heat map: per-round positional log2 fold change
  // `[round, parentId, position, state] -> log2FC`. Present only when round-frequency
  // inputs are selected (the workflow emits it conditionally).
  .outputWithStatus("compositionHeatmapPf", (ctx): PFrameHandle | undefined => {
    try {
      const pCols = ctx.outputs?.resolve("compositionHeatmapPf")?.getPColumns();
      if (pCols === undefined) return undefined;
      return createPFrameForGraphs(ctx, pCols);
    } catch {
      return undefined;
    }
  })
  .output("compositionHeatmapPCols", (ctx) => {
    try {
      return ctx.outputs?.resolve("compositionHeatmapPf")?.getPColumns();
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

  // Subtitle: custom label if the user renamed the block, else the selected dataset's name
  // (snapshotted into data by the UI on selection), else a prompt. The subtitle context is
  // args-only — it can't resolve the dataset label live — so the name must already be in data.
  .subtitle((ctx) => ctx.data.customBlockLabel || ctx.data.defaultBlockLabel || NO_DATASET_LABEL)

  // Main page is the mutation-enrichment heat map itself (GraphMaker hosts the
  // settings form). The known×sample heat map gets its own page.
  .sections((ctx) => {
    const sections: { type: "link"; href: `/${string}`; label: string }[] = [
      { type: "link", href: "/", label: "Mutation Heatmap" },
    ];
    // Needs a baseline + at least one comparison round (see workflow's hasComposition).
    if (ctx.data.roundFrequencyRefs.length >= 2) {
      sections.push({ type: "link", href: "/composition", label: "Enrichment Analysis" });
    }
    if (ctx.data.knownAbundanceRef !== undefined) {
      sections.push({ type: "link", href: "/known-heatmap", label: "Known Variants" });
    }
    return sections;
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
