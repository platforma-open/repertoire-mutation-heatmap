import type { ColumnVisibilityRule, PlDataTableModel, RenderCtx } from "@platforma-sdk/model";
import { ColumnsCollection, DataColumn, createPlDataTableV3 } from "@platforma-sdk/model";
import { MUTATION_ID_AXIS, MUTATION_VARIANT_LINK, VARIANT_KEY_AXIS } from "./specs";
import type { BlockArgs, BlockData } from "./types";
import { dedupByLeafId, exactMatch, outputPColumns, poolSpecByRef } from "./render-utils";

/**
 * The Table tab: every variant carrying the active drill-down's substitution, at any mutation
 * count.
 *
 * The block exports only the `[variantKey, mutationId]` linker as the primary column; sequence,
 * mutations, mutation count, abundance and the scores are joined in from the result pool on the
 * shared variantKey axis, so none of them is copied into this block's own exports and the user
 * can surface any other variant-keyed column later.
 */
export function drillDownTableModel(
  ctx: RenderCtx<BlockArgs, BlockData>,
): PlDataTableModel | undefined {
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
  const stateSpec = poolSpecByRef(ctx, stateMatrixRef);
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
  const discovered = ColumnsCollection(["result_pool"])
    .discover({
      anchors: { main: stateSpec },
      mode: "enrichment",
      maxHops: 0,
      exclude: [{ annotations: { "pl7.app/isLinkerColumn": exactMatch("true") } }],
    })
    .getColumns();

  const secondary = dedupByLeafId(discovered).filter((recipe) => {
    const axes = recipe.getSpec().axesSpec;
    return axes.length === 1 && axes[0].name === VARIANT_KEY_AXIS;
  });

  // The score this drill-down was opened from — the one the section header names, and the only
  // one shown by default. Resolved against the UNDEDUPED discovery: `scoreRefs` ids come from
  // the same query in `scoreOptions`, but that dedups on name+domain while `dedupByLeafId`
  // dedups on the leaf id, so the two can keep different reachability variants of one column
  // and a lookup against `secondary` alone would miss intermittently.
  const scoreKey = ctx.data.drillDowns.find((d) => d.mutationId === mutationId)?.scoreKey;
  const activeScoreSpec =
    scoreKey === undefined
      ? undefined
      : discovered.find((recipe) => (recipe.id as string) === scoreKey)?.getSpec();

  // Default column set: the ones that answer "what else carries this substitution, and what
  // happened to it". Everything else the discovery reached stays in the column picker but
  // starts switched off — a project carrying UMAP dimensions, sequence properties and two
  // conditions' worth of scores otherwise opens ~15 columns wide.
  //
  // Matching is by spec, never by id: `ColumnSelector` has no id form. For the score that means
  // name + domain, which is exactly what tells `Bin score (5.5)` from `(7.5)` — the same
  // identity `scoreOptions` dedups on. Carrying the whole domain rather than just the condition
  // keeps this correct for any score whose columns are split on something else as well.
  const visibility: ColumnVisibilityRule[] = [
    { match: { name: exactMatch("pl7.app/label") }, visibility: "default" },
    { match: { name: exactMatch("pl7.app/repertoire/mutations") }, visibility: "default" },
    { match: { name: exactMatch("pl7.app/repertoire/mutationCount") }, visibility: "default" },
    // The WHOLE-variant sequence only. The per-region subsequences (FR1, CDR1, …) carry the same
    // `pl7.app/sequence` name and differ only by their `pl7.app/feature` domain, so matching on
    // the name alone pulled all seven in — and worse, promoted them: they declare themselves
    // `optional`, and a `default` rule outranks the intrinsic annotation. `isMainSequence` is the
    // profiler's own marker for the one sequence that is the variant, and it survives a run that
    // sets no complete-feature name (where the label is "Sequence aa", not "VDJRegion aa").
    {
      match: {
        name: exactMatch("pl7.app/sequence"),
        annotations: { "pl7.app/isMainSequence": exactMatch("true") },
      },
      visibility: "default",
    },
  ];
  if (activeScoreSpec !== undefined)
    visibility.push({
      match: {
        name: exactMatch(activeScoreSpec.name),
        domain: Object.fromEntries(
          Object.entries(activeScoreSpec.domain ?? {}).map(([k, v]) => [k, exactMatch(v)]),
        ),
      },
      visibility: "default",
    });
  // Catch-all, LAST — first matching rule wins. A bare `.*` is an unanchored regex, so it
  // matches every name; an empty selector is not used, since "matches nothing specified" is not
  // a documented shorthand for "matches everything".
  visibility.push({ match: { name: ".*" }, visibility: "optional" });

  return createPlDataTableV3(ctx, {
    primaryColumns: [DataColumn.fromColumn(linker)],
    columns: secondary,
    displayOptions: { visibility },
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
}
