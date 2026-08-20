import { assertParamsObject, defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * This block's init-params contract — the shape a block of this kind receives
 * at creation, and exactly what a project template serializes for it.
 *
 * Deliberately empty. Every input this block needs is a result-pool reference
 * the user picks after creation: the profiler state matrix, the abundance and
 * known-abundance columns, the per-round frequency columns and the per-variant
 * score columns. A template cannot name any of them, because a reference only
 * exists once the upstream block has run.
 *
 * The scalar knobs are the natural first params once the `DataModelBuilder` /
 * `BlockModelV3.create` wiring for kinds lands: `level` (aminoacid vs
 * nucleotide), `valueMode` (abundance vs property), `normalize`, and
 * `compositionEpsilon`. All four are plain enumerated or numeric values a
 * template could reasonably pin, and all four already carry defaults in the
 * model's `init()`. Adding an optional field to this contract later is
 * backwards compatible, so starting empty costs nothing.
 */
export type BlockParams = Record<string, never>;

/**
 * The same contract at runtime, for params that arrive from a template file
 * rather than from typed code.
 *
 * The contract names no fields, so there is nothing to read and nothing to
 * validate beyond the value being an object at all. Keys a template supplies
 * anyway are dropped by not being read. The return type holds this in step: the
 * moment `BlockParams` declares a required field, `return {}` stops compiling.
 */
function parseInitializationParams(value: unknown): BlockParams {
  assertParamsObject(value);

  return {};
}

// Identity (`name`/`version`) comes from this package's own `package.json`, so
// the on-wire `{name}@{version}` reference can never drift from what npm
// publishes; the bundler inlines the JSON import.
export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseInitializationParams,
});
