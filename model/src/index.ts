import type {
  InferOutputsType,
  PColumnSpec,
  PFrameHandle,
  SUniversalPColumnId,
} from "@platforma-sdk/model";
import { kind } from "@platforma-open/milaboratories.repertoire-mutation-heatmap.kind";
import {
  makeDrillDownChartState,
  makeLandscapeChartState,
  mapChartStates,
  withEmptyNAValue,
  withParentOnXAxis,
  withRegionColoursReseeded,
} from "./chart-state";
import { dedupByLeafId, exactMatch, outputPColumns, poolSpecByRef } from "./render-utils";
import { drillDownTableModel } from "./drill-down-table";
import {
  BROWSABLE_MUTATION,
  LANDSCAPE_SCORE_INDEX,
  LANDSCAPE_SCORE_REF,
  LANDSCAPE_VALUE,
  STATE_MATRIX,
} from "./specs";
import type {
  BlockArgs,
  BlockData,
  BlockDataV1,
  BlockDataV2,
  BlockDataV3,
  BlockDataV4,
  LandscapePanel,
} from "./types";

// The model's public surface is the package root; the files are an internal split.
export type * from "./types";
export {
  makeDrillDownChartState,
  makeLandscapeChartState,
  withParentOnXAxis,
  withRegionColoursReseeded,
} from "./chart-state";
// `createPlDataTableV3`'s return type reaches into `Nil` from helpers, and TS cannot name it
// from here without this — the same re-export every block building a table carries.
export type * from "@milaboratories/helpers";
import {
  BlockModelV3,
  ColumnsCollection,
  createPlDataTableStateV2,
  DataModelBuilder,
  createPFrameForGraphs,
} from "@platforma-sdk/model";

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
  // Per-position variant browsing, in one step. This feature was never released, so the several
  // versions it passed through during development are not history anyone's project has to walk —
  // v4 is the last shape that shipped.
  //
  // Adds the drill-down list and the one chart and table state they share, and drops the saved
  // region colour mapping so the palette the region column now declares can seed it. Without
  // that last part a chart keeps whatever mapping it built for itself, and a landscape and a
  // drill-down go on colouring the same region differently.
  .migrate<BlockData>("v5", (v4) => ({
    ...v4,
    drillDowns: [],
    drillDownChartState: makeDrillDownChartState(),
    drillDownTableState: createPlDataTableStateV2(),
    ...mapChartStates(v4, withRegionColoursReseeded),
  }))
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
    const stateSpec = poolSpecByRef(ctx, stateMatrixRef);
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
    const stateSpec = poolSpecByRef(ctx, stateMatrixRef);
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

  // Table tab. The assembly lives in its own file: the axis-filter rule it turns on needs more
  // explaining than it needs code.
  .outputWithStatus("drillDownTable", (ctx) => drillDownTableModel(ctx))

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
