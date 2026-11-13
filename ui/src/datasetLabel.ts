import type { PlRef } from "@platforma-sdk/model";
import { plRefsEqual } from "@platforma-sdk/model";
import { watch } from "vue";
import type { useApp } from "./app";

type AppModel = ReturnType<typeof useApp>["model"];

/**
 * The name the subtitle shows for a picked dataset: the subset's label when one is picked,
 * as it already carries the dataset as a prefix. `undefined` while the dataset is not among
 * the picker's options.
 */
export function datasetLabel(
  model: AppModel,
  ref: PlRef,
  filterRef: PlRef | undefined,
): string | undefined {
  const option = model.outputs.stateMatrixOptions?.find((o) =>
    plRefsEqual(o.primary.ref, ref, true),
  );
  const filter = filterRef
    ? option?.filters?.find((f) => plRefsEqual(f.ref, filterRef, true))
    : undefined;
  return (filter ?? option?.primary)?.label;
}

/**
 * Names a dataset that was set without the picker: a block made from a project template
 * starts with its dataset chosen and no name for it, and the subtitle would go on saying
 * that none is selected. The name never reaches the args, so writing it from the options
 * cannot stale the block.
 */
export function backfillDatasetLabel(model: AppModel) {
  watch(
    () => [model.data.stateMatrixRef, model.data.filterRef, model.outputs.stateMatrixOptions],
    () => {
      const ref = model.data.stateMatrixRef;
      if (!ref || model.data.defaultBlockLabel) return;
      const label = datasetLabel(model, ref, model.data.filterRef);
      if (label) model.data.defaultBlockLabel = label;
    },
    { immediate: true },
  );
}
