import type {
  DatasetOption,
  InferOutputsType,
  PColumnSpec,
  PFrameHandle,
  RenderCtx,
  SUniversalPColumnId,
} from "@platforma-sdk/model";
import { kind } from "@platforma-open/milaboratories.repertoire-mutation-heatmap.kind";
import {
  makeDrillDownChartState,
  makeLandscapeChartState,
  mapChartStates,
  withEmptyNAValue,
  withErrorOpacityRange,
  withParentOnXAxis,
  withRegionColoursReseeded,
  withYAnnotationTitleAtBottom,
} from "./chart-state";
import { dedupByLeafId, exactMatch, outputPColumns, poolSpecByRef } from "./render-utils";
import { drillDownTableModel } from "./drill-down-table";
import {
  BROWSABLE_MUTATION,
  LANDSCAPE_ERROR,
  LANDSCAPE_NT_VARIANTS,
  LANDSCAPE_SCORE_INDEX,
  LANDSCAPE_SCORE_INDEX_DOMAIN,
  LANDSCAPE_SCORE_REF,
  LANDSCAPE_VALUE,
  PARENT_LINK,
  STATE_MATRIX,
  VARIANT_KEY_AXIS,
} from "./specs";
import type {
  BlockArgs,
  BlockData,
  BlockDataV1,
  BlockDataV2,
  BlockDataV3,
  BlockDataV4,
  BlockDataV5,
  BlockDataV6,
  LandscapePanel,
} from "./types";

// The model's public surface is the package root; the files are an internal split.
export type * from "./types";
export { PAIR_ERROR, PAIR_NT_VARIANTS, PARENT_ID_AXIS } from "./specs";
export {
  makeDrillDownChartState,
  makeLandscapeChartState,
  withErrorOpacityRange,
  withParentOnXAxis,
  withRegionColoursReseeded,
  withYAnnotationTitleAtBottom,
} from "./chart-state";
// `createPlDataTableV3`'s return type reaches into `Nil` from helpers, and TS cannot name it
// from here without this — the same re-export every block building a table carries.
export type * from "@milaboratories/helpers";
import {
  BlockModelV3,
  buildDatasetOptions,
  ColumnsCollection,
  createGlobalPObjectId,
  createPlDataTableStateV2,
  DataModelBuilder,
  createPFrameForGraphs,
  deriveDistinctLabels,
  isPColumnSpec,
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
 *
 * `labelByRef` maps a score's ref to its picker label. The workflow stamps each column with the
 * score's own native label, which two sibling blocks share. The picker already told them apart, so
 * its label is used when given, and the stamped one is the fallback.
 */
export function landscapePanelsFrom(
  pCols: { spec: PColumnSpec }[] | undefined,
  labelByRef?: Map<string, string>,
): LandscapePanel[] | undefined {
  if (pCols === undefined) return undefined;
  const panels: LandscapePanel[] = [];
  for (const col of pCols) {
    if (col.spec.name !== LANDSCAPE_VALUE) continue;
    const key = col.spec.annotations?.[LANDSCAPE_SCORE_REF];
    // Pre-per-score-charts run: no ref, so no state key. Such a project shows the empty state
    // until it is re-run.
    if (key === undefined) continue;
    const scoreIndex = col.spec.domain?.[LANDSCAPE_SCORE_INDEX_DOMAIN];
    const companion = (name: string) =>
      pCols.find(
        (c) => c.spec.name === name && c.spec.domain?.[LANDSCAPE_SCORE_INDEX_DOMAIN] === scoreIndex,
      )?.spec;
    panels.push({
      key,
      label: labelByRef?.get(key) ?? col.spec.annotations?.["pl7.app/label"] ?? "Score",
      index: Number(col.spec.annotations?.[LANDSCAPE_SCORE_INDEX] ?? "0"),
      spec: col.spec,
      errorSpec: companion(LANDSCAPE_ERROR),
      ntVariantsSpec: companion(LANDSCAPE_NT_VARIANTS),
    });
  }
  panels.sort((a, b) => a.index - b.index);
  return panels;
}

/**
 * Whether a discovered column can be plotted as a landscape score.
 *
 * A cell is ONE variant's value, so the column must be numeric and keyed on the variant axis and
 * nothing else. Numeric alone — all this used to check — admitted two kinds that cannot be drawn:
 *
 *  - Keyed on the anchor's OTHER axes. Sort-Seq's baselines sit on `[parentId]` and
 *    `[parentId, position]`, both reachable from the state matrix, so they were offered as scores.
 *    The workflow reads `pt.axis(variantKey)` off whatever it is given, which those do not have.
 *  - Keyed on the variant axis PLUS another, such as `[variantKey, gate]`. Those do join, but give
 *    several rows per variant, and the landscape's one-row-per-cell `first` would then pick one of
 *    them with nothing reporting it — the worst of the three outcomes.
 *
 * Deliberately NOT filtered on `pl7.app/isScore`, though Sort-Seq sets it and an earlier comment
 * in the picker expected to use it once that block landed. It would also drop variant-keyed
 * columns a user may legitimately plot — an abundance, a mutation count — which carry no such
 * annotation. The axis shape is a hard requirement of the plot; the annotation is a statement of
 * intent, and the two should not be confused.
 */
export function isLandscapeScoreColumn(
  spec: PColumnSpec,
  variantAxisName: string | undefined,
): boolean {
  const numeric = new Set(["Int", "Long", "Float", "Double"]);
  if (!numeric.has(spec.valueType as string)) return false;
  if (variantAxisName === undefined) return false;
  return spec.axesSpec.length === 1 && spec.axesSpec[0].name === variantAxisName;
}

/** The subset a column was computed on (Clonotype Enrichment's stamp), if any. */
export function subsetStampOf(spec: PColumnSpec): string | undefined {
  return spec.domain?.["pl7.app/inputSubset"];
}

/**
 * Picker entries for score and round columns. Only columns that fit the run: full-data ones, or
 * ones computed on the run's own subset. Labels come from the trace, so a subset's copy is named.
 */
function runColumnOptions(
  entries: { id: string; spec: PColumnSpec }[],
  inputFilter: string | undefined,
): { label: string; value: SUniversalPColumnId; subset?: string }[] {
  const fitting = entries.filter((e) => {
    const stamp = subsetStampOf(e.spec);
    return stamp === undefined || stamp === inputFilter;
  });
  // Always show the native column label, so sibling blocks that produce the same score or round
  // stay told apart by their trace. Without this, a label is dropped once it is not needed for
  // uniqueness, and two upstream copies read identically in the picker.
  const labels = deriveDistinctLabels(
    fitting.map((e) => e.spec),
    { includeNativeLabel: true },
  );
  return fitting.map((e, i) => ({
    label: labels[i] ?? e.id,
    value: e.id as SUniversalPColumnId,
    ...(subsetStampOf(e.spec) !== undefined && { subset: subsetStampOf(e.spec) }),
  }));
}

/** The run's subset as the workflow and the stamp write it. */
function inputFilterOf(data: BlockData): string | undefined {
  return data.filterRef && createGlobalPObjectId(data.filterRef.blockId, data.filterRef.name);
}

/** The section href of one landscape page. */
export function landscapeHref(scoreKey: string): `/?score=${string}` {
  return `/?score=${encodeURIComponent(scoreKey)}`;
}

/** `Landscape · Bin score (5.5)` — what the sidebar shows for one landscape page. */
export function landscapeLabel(scoreLabel: string): string {
  return `Landscape · ${scoreLabel}`;
}

/**
 * score id -> display label, from the columns the last run produced.
 *
 * `labelByRef` carries the picker labels, which tell sibling blocks' same-named scores apart. It is
 * preferred per score; the column's stamped label is the fallback. See {@link landscapePanelsFrom}.
 */
export function scoreLabelsByKey(
  pCols: { spec: PColumnSpec }[] | undefined,
  labelByRef?: Map<string, string>,
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const col of pCols ?? []) {
    if (col.spec.name !== LANDSCAPE_VALUE) continue;
    const key = col.spec.annotations?.[LANDSCAPE_SCORE_REF];
    const label = labelByRef?.get(key ?? "") ?? col.spec.annotations?.["pl7.app/label"];
    if (key !== undefined && label !== undefined) labels[key] = label;
  }
  return labels;
}

/**
 * Score picker options from the result pool.
 *
 * Shared by the `scoreOptions` output and by section / panel naming, so a score's page is named by
 * the same label the user picked it under, and the two cannot drift.
 *
 * Discovered via discover() anchored on the state matrix, not getCanonicalOptions: a canonical id
 * bakes in a column's nested-escaped-JSON domains, which fail to round-trip in the workflow's
 * anchored query. The anchor name `main` must match the workflow's `bb.addAnchor(...)`.
 *
 * Numeric only — a cell holds one variant's score. NOT restricted to `pl7.app/isScore`: no shipped
 * block emits a variant-keyed column carrying that annotation yet (repertoire-score is
 * clonotype-keyed), so filtering on it would leave the dropdown empty. Revisit once the bin-score
 * block lands.
 */
function computeScoreOptions(
  ctx: RenderCtx<BlockArgs, BlockData>,
): { label: string; value: SUniversalPColumnId; subset?: string }[] | undefined {
  const stateMatrixRef = ctx.data.stateMatrixRef;
  if (stateMatrixRef === undefined) return undefined;
  const stateSpec = poolSpecByRef(ctx, stateMatrixRef);
  if (!stateSpec) return undefined;

  // The result pool is handed over whole (the `"result_pool"` shorthand) rather than
  // pre-filtered column by column. Linkers are dropped host-side; File-valued columns
  // cannot be named in a selector, and the numeric check below already excludes them.
  const columns = ColumnsCollection(["result_pool"])
    .discover({
      anchors: { main: stateSpec },
      mode: "enrichment",
      maxHops: 0,
      exclude: [{ annotations: { "pl7.app/isLinkerColumn": exactMatch("true") } }],
    })
    .getColumns();

  // The anchor's own axis 0 rather than a literal, so the check stays on the axis this dataset
  // is actually keyed on.
  const variantAxisName = stateSpec.axesSpec[0]?.name;
  // Dedup by leaf id, not by name + domain: a sibling block's score column shares the name, and
  // the producing block's identity sits in contextDomain, not domain, so a name + domain key
  // collides and drops it. The leaf id collapses only the same storage column reached by several
  // paths.
  const entries = dedupByLeafId(
    columns.filter((recipe) => isLandscapeScoreColumn(recipe.getSpec(), variantAxisName)),
  ).map((recipe) => ({ id: recipe.id, spec: recipe.getSpec() }));
  return runColumnOptions(entries, inputFilterOf(ctx.data));
}

/** ref -> picker label for the discovered scores. See {@link computeScoreOptions}. */
function scoreLabelByRefFrom(ctx: RenderCtx<BlockArgs, BlockData>): Map<string, string> {
  return new Map<string, string>(
    (computeScoreOptions(ctx) ?? []).map((o): [string, string] => [o.value, o.label]),
  );
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
  .migrate<BlockDataV5>("v5", (v4) => ({
    ...v4,
    drillDowns: [],
    drillDownChartState: makeDrillDownChartState(),
    drillDownTableState: createPlDataTableStateV2(),
    ...mapChartStates(v4, withRegionColoursReseeded),
  }))
  // The Y-axis amino acid tracks: their titles go below the map, on every saved chart.
  .migrate<BlockDataV6>("v6", (v5) => ({
    ...v5,
    ...mapChartStates(v5, withYAnnotationTitleAtBottom),
    drillDownChartState: withYAnnotationTitleAtBottom(v5.drillDownChartState),
  }))
  // The reversed error opacity, on the landscape and drill-down charts.
  .migrate<BlockData>("v7", (v6) => ({
    ...v6,
    singleMutantHeatmapState: withErrorOpacityRange(v6.singleMutantHeatmapState),
    singleMutantHeatmapStates: Object.fromEntries(
      Object.entries(v6.singleMutantHeatmapStates).map(([key, state]) => [
        key,
        withErrorOpacityRange(state),
      ]),
    ),
    drillDownChartState: withErrorOpacityRange(v6.drillDownChartState),
  }))
  // The first four fields are the kind's init-params contract, and `.templateParams(...)`
  // below projects the same four back out. `params` is optional: a block may be created
  // without a template.
  .init(({ params }) => ({
    stateMatrixRef: params?.stateMatrixRef,
    filterRef: params?.filterRef,
    selectedParentId: params?.selectedParentId,
    scoreRefs: params?.scoreRefs ?? [],
    drillDowns: [],
    drillDownChartState: makeDrillDownChartState(),
    drillDownTableState: createPlDataTableStateV2(),
    // The landing page opens with the Settings drawer out: a fresh block has nothing to plot,
    // and Settings is the first thing the user needs. The page closes it when a run starts.
    singleMutantHeatmapState: makeLandscapeChartState("Single Mutation Landscape", "settings"),
    singleMutantHeatmapStates: {},
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
      ...(data.filterRef !== undefined && {
        inputFilter: createGlobalPObjectId(data.filterRef.blockId, data.filterRef.name),
      }),
      selectedParentId: data.selectedParentId,
      // Order is the facet order the user arranged — pass through verbatim, do not sort.
      scoreRefs: data.scoreRefs ?? [],
    };
  })

  // The inverse of the data model's `init`: the same four fields, so a project exported as a
  // template and re-applied comes back with the dataset, the parent and the scores it went
  // out with. The score ids name upstream blocks, as the two references do; applying a
  // template points all of them at the blocks of the project being made.
  .templateParams((data) => ({
    stateMatrixRef: data.stateMatrixRef,
    filterRef: data.filterRef,
    selectedParentId: data.selectedParentId,
    scoreRefs: data.scoreRefs,
  }))

  // --- Input selection from the result pool ---

  // Dataset picker: show the dataset (trace) label, like other blocks (e.g.
  // clonotype-clustering), not the column's native label ("Mutation State aa").
  // aa and nt state matrices share the name + dataset label, distinguished only by the
  // pl7.app/alphabet domain — so when one dataset exposes both, append a compact (aa)/(nt)
  // suffix to keep the options unique; otherwise leave the plain dataset name.
  // Each state matrix carries its variant subsets (e.g. Lead Selection picks) as filters.
  .output("stateMatrixOptions", (ctx): DatasetOption[] => {
    const options =
      buildDatasetOptions(ctx, {
        primary: (spec) => isPColumnSpec(spec) && spec.name === STATE_MATRIX,
        // Only subsets keyed by the variant axis alone: a parent subset is the Parent picker's job.
        filter: (spec) =>
          isPColumnSpec(spec) &&
          spec.axesSpec.length === 1 &&
          spec.axesSpec[0].name === VARIANT_KEY_AXIS,
        requireEnrichments: false,
      }) ?? [];
    const labelCounts = new Map<string, number>();
    for (const { primary } of options)
      labelCounts.set(primary.label, (labelCounts.get(primary.label) ?? 0) + 1);
    return options.map((o) => {
      if ((labelCounts.get(o.primary.label) ?? 0) <= 1) return o;
      const alphabet = ctx.resultPool
        .getPColumnSpecByRef(o.primary.ref)
        ?.axesSpec.find((a) => a.domain?.["pl7.app/alphabet"])?.domain?.["pl7.app/alphabet"];
      const suffix = alphabet === "aminoacid" ? " (aa)" : alphabet === "nucleotide" ? " (nt)" : "";
      return { ...o, primary: { ...o.primary, label: o.primary.label + suffix } };
    });
  })

  // Per-variant numeric score columns for the mutation landscape. See computeScoreOptions.
  .output("scoreOptions", (ctx) => computeScoreOptions(ctx))

  // The variant -> parent linker and the subset column in one frame, so the UI can offer only
  // parents the subset reaches. Undefined without a subset or when the dataset has no linker.
  .output("subsetParentsFrame", (ctx) => {
    const { stateMatrixRef, filterRef } = ctx.data;
    if (stateMatrixRef === undefined || filterRef === undefined) return undefined;
    const variantAxis = poolSpecByRef(ctx, stateMatrixRef)?.axesSpec[0];
    const filter = ctx.resultPool.getPColumnByRef(filterRef);
    if (variantAxis === undefined || filter === undefined) return undefined;
    const linker = ctx.resultPool
      .selectColumns(
        (spec) =>
          spec.name === PARENT_LINK &&
          spec.axesSpec.some(
            (a) =>
              a.name === variantAxis.name &&
              Object.entries(variantAxis.domain ?? {}).every(([k, v]) => a.domain?.[k] === v),
          ),
      )
      .find((c) => c.data !== undefined);
    if (linker?.data === undefined) return undefined;
    return {
      frame: ctx.createPFrame([{ ...linker, data: linker.data }, filter]),
      linkerId: linker.id,
      filterId: filter.id,
    };
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
    landscapePanelsFrom(outputPColumns(ctx, "singleMutantHeatmapPf"), scoreLabelByRefFrom(ctx)),
  )

  // Single-mutant variants of the selected parent in the last run. Undefined until a run with
  // score columns has finished. The field is absent when the run had no score columns, and in
  // results produced by block versions that did not emit it.
  .output("singleMutantCount", (ctx) => {
    return ctx.outputs
      ?.resolve({
        field: "singleMutantCount",
        assertFieldType: "Input",
        allowPermanentAbsence: true,
      })
      ?.getDataAsJson<{ singleMutantCount: number }>()?.singleMutantCount;
  })

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

  .output("isRunning", (ctx) => ctx.outputs?.getIsReadyOrError() === false)

  .title(() => "Mutation Explorer")

  // Subtitle: custom label if the user renamed the block, else the selected dataset's name
  // (snapshotted into data by the UI on selection), else a prompt. The subtitle context is
  // args-only — it can't resolve the dataset label live — so the name must already be in data.
  .subtitle((ctx) => ctx.data.customBlockLabel || ctx.data.defaultBlockLabel || NO_DATASET_LABEL)

  .sections((ctx) => {
    const pCols = outputPColumns(ctx, "singleMutantHeatmapPf");
    // Picker labels, so a page is named the way its score reads in Settings — sibling blocks'
    // same-named scores included.
    const labelByRef = scoreLabelByRefFrom(ctx);
    const panels = landscapePanelsFrom(pCols, labelByRef) ?? [];

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
      const scoreLabels = scoreLabelsByKey(pCols, labelByRef);
      sections.push({ type: "delimiter" });
      for (const d of drillDowns) {
        sections.push({
          type: "link",
          href: drillDownHref(d.mutationId),
          label: drillDownLabel(d.mutationId, scoreLabels[d.scoreKey]),
        });
      }
    }

    return sections;
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
