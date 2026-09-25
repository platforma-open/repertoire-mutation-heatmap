import type { ColumnRecipe, PColumnSpec, PlRef, RenderCtx } from "@platforma-sdk/model";
import { extractPObjectId } from "@platforma-sdk/model";
import type { BlockArgs, BlockData } from "./types";

/** A selector `name`/`domain` given as a bare string normalizes to a REGEX matcher, so an
 *  exact name must be spelled out. `"pl7.app/frequency"` as a regex is unanchored and `.`
 *  matches any character, which would also admit `pl7.app/frequencyRatio`. */
export const exactMatch = (value: string) => [{ type: "exact" as const, value }];

/** Collapse discovery hits to one recipe per storage column, first hit wins.
 *
 *  The retired `findColumns()` keyed its result map on the leaf column, merging several
 *  reachability variants into one entry. `discover().getColumns()` returns one recipe PER
 *  variant instead, and the value these options carry is the leaf id — so without this,
 *  variants of one column become several dropdown entries sharing a single value. */
export function dedupByLeafId(recipes: ColumnRecipe[]): ColumnRecipe[] {
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
export function outputPColumns(ctx: RenderCtx<BlockArgs, BlockData>, name: string) {
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

/**
 * Spec for a ref from the result pool, reported absent only once that absence has settled.
 *
 * `getPColumnSpecByRef` answers from the pool as it stands and registers nothing, so a column
 * that has not reached the pool yet is indistinguishable from one that never will. The output
 * settles at `undefined`, and a table fed by it then renders its not-ready text ("Select score
 * columns in Settings, then Run") for the seconds the pool takes to fill, although nothing is
 * wrong and the data is on its way. `getSpecs` does register — the middle layer marks the render
 * unstable while the pool is incomplete (`specs_from_pool_incomplete`) — so consulting it on a
 * miss keeps the output unsettled until the pool is complete and the absence is real.
 */
export function poolSpecByRef(
  ctx: RenderCtx<BlockArgs, BlockData>,
  ref: PlRef,
): PColumnSpec | undefined {
  const spec = ctx.resultPool.getPColumnSpecByRef(ref);
  if (spec !== undefined) return spec;
  ctx.resultPool.getSpecs();
  return undefined;
}
