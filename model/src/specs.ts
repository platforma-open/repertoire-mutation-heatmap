/**
 * Column and axis names this block shares with its workflow and with the profiler upstream.
 *
 * Every string here is a contract: change one and the matching literal in
 * `workflow/src/main.tpl.tengo` — or in the profiler that emits it — has to change with it, or
 * the column simply stops being found and an output goes quietly empty. They live in one file so
 * that obligation is visible rather than buried among the render helpers.
 */

// Profiler spec names used as join keys — must stay byte-identical to the names the profiler emits.
export const STATE_MATRIX = "pl7.app/repertoire/stateMatrix";
export const VARIANT_KEY_AXIS = "pl7.app/variantKey";
export const PARENT_ID_AXIS = "pl7.app/repertoire/parentId";
/** Profiler linker `[parentId, variantKey]`: which parent each variant belongs to. */
export const PARENT_LINK = "pl7.app/repertoire/parentLink";

// One such column per selected score. Must stay byte-identical to the workflow's import spec.
export const LANDSCAPE_VALUE = "pl7.app/repertoire/singleMutantValue";
export const LANDSCAPE_SCORE_REF = "pl7.app/repertoire/landscapeScoreRef";
export const LANDSCAPE_SCORE_INDEX = "pl7.app/repertoire/landscapeScoreIndex";

// Drill-down columns. Same byte-identical contract with the workflow as the landscape names.
export const MUTATION_ID_AXIS = "pl7.app/repertoire/mutationId";
export const MUTATION_VARIANT_LINK = "pl7.app/repertoire/mutationVariantLink";
export const BROWSABLE_MUTATION = "pl7.app/repertoire/browsableMutation";

// A score's error and nucleotide-variant count, on the same cells as its value and told apart from
// other scores' by the same `landscapeScore` domain key.
export const LANDSCAPE_ERROR = "pl7.app/repertoire/singleMutantError";
export const LANDSCAPE_NT_VARIANTS = "pl7.app/repertoire/singleMutantNtVariants";
export const PAIR_ERROR = "pl7.app/repertoire/pairMutantError";
export const PAIR_NT_VARIANTS = "pl7.app/repertoire/pairMutantNtVariants";
export const LANDSCAPE_SCORE_INDEX_DOMAIN = "pl7.app/repertoire/landscapeScore";

// Annotations on a landscape value column naming the upstream companion columns.
export const LANDSCAPE_ERROR_COLUMN = "pl7.app/repertoire/landscapeScoreErrorColumn";
export const LANDSCAPE_NT_VARIANTS_COLUMN = "pl7.app/repertoire/landscapeScoreNtVariantsColumn";
