import type { GraphMakerState } from "@milaboratories/graph-maker";
import type {
  ColumnRecipe,
  InferOutputsType,
  PColumnSpec,
  PFrameHandle,
  PlRef,
  SUniversalPColumnId,
} from "@platforma-sdk/model";
import { kind } from "@platforma-open/milaboratories.repertoire-mutation-heatmap.kind";
import {
  BlockModelV3,
  ColumnsCollection,
  DataModelBuilder,
  createPFrameForGraphs,
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

// Profiler spec names used as join keys — must stay byte-identical to the names the profiler emits.
const STATE_MATRIX = "pl7.app/repertoire/stateMatrix";

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
  singleMutantHeatmapState: GraphMakerState;
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

const dataModel = new DataModelBuilder({ kind }).from<BlockData>("v1").init(() => ({
  roundFrequencyRefs: [],
  compositionEpsilon: 1e-6,
  scoreRefs: [],
  singleMutantHeatmapState: {
    title: "Mutation Landscape",
    template: "heatmap",
    // This is the landing page, so it opens with the Settings drawer out: a fresh block has no
    // dataset and nothing to plot, and Settings is the first thing the user needs. The page
    // closes it when a run starts.
    currentTab: "settings",
    // Cells are per-variant scores taken directly, not counts — GraphMaker's row z-score and
    // transform would both distort them, and the values arrive already normalized upstream.
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
      },
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

  // Single-mutant landscape: per-score singleton values
  // `[score, parentId, position, state] -> cellValue`. Present only when score columns are
  // selected AND the profiler emitted a mutation count (the workflow emits it conditionally).
  .outputWithStatus("singleMutantHeatmapPf", (ctx): PFrameHandle | undefined => {
    try {
      const pCols = ctx.outputs?.resolve("singleMutantHeatmapPf")?.getPColumns();
      if (pCols === undefined) return undefined;
      return createPFrameForGraphs(ctx, pCols);
    } catch {
      return undefined;
    }
  })
  .output("singleMutantHeatmapPCols", (ctx) => {
    try {
      return ctx.outputs?.resolve("singleMutantHeatmapPf")?.getPColumns();
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

  .output("isRunning", (ctx) => ctx.outputs?.getIsReadyOrError() === false)

  .title(() => "Deep Mutational Scanning")

  // Subtitle: custom label if the user renamed the block, else the selected dataset's name
  // (snapshotted into data by the UI on selection), else a prompt. The subtitle context is
  // args-only — it can't resolve the dataset label live — so the name must already be in data.
  .subtitle((ctx) => ctx.data.customBlockLabel || ctx.data.defaultBlockLabel || NO_DATASET_LABEL)

  .sections((ctx) => {
    // The landscape is unconditional and owns "/". It is the only always-listed section, so
    // it is what a block with nothing selected yet shows — and the only way to reach Settings
    // and pick a dataset. Its own empty state asks for the score columns.
    const sections: { type: "link"; href: `/${string}`; label: string }[] = [
      { type: "link", href: "/", label: "Mutation Landscape" },
    ];
    // Needs a baseline + at least one comparison round (see workflow's hasComposition).
    if (ctx.data.roundFrequencyRefs.length >= 2) {
      sections.push({ type: "link", href: "/composition", label: "Enrichment Analysis" });
    }
    return sections;
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
