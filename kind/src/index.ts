import { assertParamsObject, defineBlockKind } from "@platforma-sdk/block-kind";
import type { PlRef, SUniversalPColumnId } from "@platforma-sdk/model";
import { isPlRef } from "@platforma-sdk/model";
import { name, version } from "../package.json" with { type: "json" };

/**
 * This block's init-params contract — the shape a block of this kind receives
 * at creation, and exactly what a project template serializes for it: what the
 * user picks in Settings.
 *
 * - `stateMatrixRef` — the dataset: the profiler's state matrix.
 * - `filterRef` — the subset of it the plot is narrowed to, when one is picked.
 * - `selectedParentId` — the parent the plot is scoped to, by its id in the dataset.
 * - `scoreRefs` — the score columns of the landscape, in the order they are drawn.
 *
 * The first two are references to columns of upstream blocks and the last holds
 * column ids, which name upstream blocks too. A project template names its blocks,
 * and a block created from one receives all of these pointing at the blocks made
 * from the same entries, so a project made from a template plots what the original
 * one did.
 *
 * Left out: the dataset's name kept for the subtitle, which the UI mirrors from
 * the picker's options, the open drill-downs, and the chart and table view state.
 *
 * Every field is optional because the projection hands live state back untouched,
 * and a block whose dataset is not picked yet holds `undefined` there. Requiring
 * one would make the block export a file its own kind refuses to apply.
 */
export type BlockParams = {
  stateMatrixRef?: PlRef;
  filterRef?: PlRef;
  selectedParentId?: string;
  scoreRefs?: SUniversalPColumnId[];
};

/**
 * The same contract at runtime, for params that arrive from a template file
 * rather than from typed code.
 *
 * Each field the contract names is read and checked here; nothing else is. A key
 * this function never reads is dropped rather than refused. The checks stop at
 * the shape of a value: whether a reference or a column id names anything in the
 * project is known only once its upstream blocks exist, and is settled there.
 */
function parseInitializationParams(value: unknown): BlockParams {
  assertParamsObject(value);

  const { stateMatrixRef, filterRef, selectedParentId, scoreRefs } = value;

  if (stateMatrixRef !== undefined && !isPlRef(stateMatrixRef)) {
    throw new Error(
      "'stateMatrixRef' must be a reference to an upstream state matrix, written as { block, name }.",
    );
  }
  if (filterRef !== undefined && !isPlRef(filterRef)) {
    throw new Error(
      "'filterRef' must be a reference to an upstream subset column, written as { block, name }.",
    );
  }
  if (selectedParentId !== undefined && typeof selectedParentId !== "string") {
    throw new Error("'selectedParentId' must be a string.");
  }
  if (
    scoreRefs !== undefined &&
    !(Array.isArray(scoreRefs) && scoreRefs.every((ref) => typeof ref === "string"))
  ) {
    throw new Error("'scoreRefs' must be a list of column ids.");
  }

  return {
    stateMatrixRef,
    filterRef,
    selectedParentId,
    scoreRefs: scoreRefs as SUniversalPColumnId[] | undefined,
  };
}

// Identity (`name`/`version`) comes from this package's own `package.json`, so
// the on-wire `{name}@{version}` reference can never drift from what npm
// publishes; the bundler inlines the JSON import.
export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseInitializationParams,
});
