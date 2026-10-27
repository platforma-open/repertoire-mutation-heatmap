<script setup lang="ts">
import type {
  DatasetSelection,
  PFrameHandle,
  PObjectId,
  SUniversalPColumnId,
} from "@platforma-sdk/model";
import {
  createDatasetSelection,
  createPrimaryRef,
  getRawPlatformaInstance,
  getUniqueSourceValuesWithLabels,
  plRefsEqual,
} from "@platforma-sdk/model";
import { PARENT_ID_AXIS } from "@platforma-open/milaboratories.repertoire-mutation-heatmap.model";
import {
  PlAccordionSection,
  PlDatasetSelector,
  PlDropdown,
  PlDropdownMulti,
  PlElementList,
} from "@platforma-sdk/ui-vue";
import { computed, ref, watch } from "vue";
import { useApp } from "./app";

const app = useApp();

const compositionOpen = ref(false);

// Human label for a selected round-frequency column, from the discovery options.
function roundLabel(ref: SUniversalPColumnId): string {
  const opts = app.model.outputs.roundFrequencyOptions ?? [];
  return opts.find((o) => o.value === ref)?.label ?? String(ref);
}

// Human label for a selected score column, from the discovery options.
function scoreLabel(ref: SUniversalPColumnId): string {
  const opts = app.model.outputs.scoreOptions ?? [];
  return opts.find((o) => o.value === ref)?.label ?? String(ref);
}

// Snapshot the picked dataset's name into data on selection — the model's args-only
// `.subtitle` reads it from there (it can't resolve the label live). A user-gesture write,
// not an output→data watchEffect, so no hairpin.
const stateMatrixSelection = computed<DatasetSelection | undefined>({
  get: () => {
    const { stateMatrixRef, filterRef } = app.model.data;
    if (stateMatrixRef === undefined) return undefined;
    return createDatasetSelection(createPrimaryRef(stateMatrixRef, filterRef));
  },
  set: (selection) => {
    const ref = selection?.primary.column;
    const filterRef = selection?.primary.filter;
    const prev = app.model.data.stateMatrixRef;
    // A new subset of the same dataset keeps the parent and the full-data picks.
    if (!(ref && prev && plRefsEqual(ref, prev, true))) resetForDataset(ref);
    else if (!sameRef(filterRef, app.model.data.filterRef)) dropSubsetPicks();
    app.model.data.filterRef = filterRef;
    // The subset's label when one is picked: it already carries the dataset as a prefix.
    const option = ref
      ? app.model.outputs.stateMatrixOptions?.find((o) => plRefsEqual(o.primary.ref, ref, true))
      : undefined;
    const filter = filterRef
      ? option?.filters?.find((f) => plRefsEqual(f.ref, filterRef, true))
      : undefined;
    app.model.data.defaultBlockLabel = (filter ?? option?.primary)?.label ?? "";
  },
});

function sameRef(a: typeof app.model.data.filterRef, b: typeof app.model.data.filterRef) {
  return a === undefined || b === undefined ? a === b : plRefsEqual(a, b, true);
}

// Picks computed on the previous subset don't fit the new one: the workflow refuses them.
function dropSubsetPicks() {
  const stamped = (opts?: { value: SUniversalPColumnId; subset?: string }[]) =>
    new Set((opts ?? []).filter((o) => o.subset !== undefined).map((o) => o.value));
  const scores = stamped(app.model.outputs.scoreOptions);
  const rounds = stamped(app.model.outputs.roundFrequencyOptions);
  app.model.data.scoreRefs = app.model.data.scoreRefs.filter((r) => !scores.has(r));
  app.model.data.roundFrequencyRefs = app.model.data.roundFrequencyRefs.filter(
    (r) => !rounds.has(r),
  );
}

function resetForDataset(ref: typeof app.model.data.stateMatrixRef) {
  app.model.data.stateMatrixRef = ref;
  // Clear the parent: it belongs to the previous dataset. selectedParentId is required in
  // args, so this holds the workflow (uncalculated) until the options watch auto-selects a
  // valid default — avoiding a run over a stale/mismatched selection.
  app.model.data.selectedParentId = undefined;
  // Score and round ids are anchored on the previous dataset and resolve to nothing on the new
  // one; left in place they reach the workflow and fail it on a column with no spec.
  app.model.data.scoreRefs = [];
  app.model.data.roundFrequencyRefs = [];
  // Open drill-downs name a substitution and score of the previous dataset. The prune in
  // useDrillDowns keeps them when the new run has no scores or reuses the parent id.
  app.model.data.drillDowns = [];
}

// Enumerate the available parents from the state matrix's parentId axis (idx 1) — straight from
// the result pool, so the selector is populated before the main workflow runs. Then auto-select
// the first parent when nothing valid is chosen. The write targets `selectedParentId`, but the
// options come from `stateMatrixPf` (which does NOT depend on it), so this can't loop — the same
// safe, deterministic default-selection shape as the block-label pattern.
const parentOptions = ref<{ value: string; label: string }[]>([]);

// Parents with variants in the subset: the parent linker inner-joined with the subset column.
async function subsetParents(
  frame: PFrameHandle,
  linkerId: PObjectId,
  filterId: PObjectId,
): Promise<Set<string>> {
  const res = await getRawPlatformaInstance().pFrameDriver.calculateTableData(frame, {
    src: {
      type: "inner",
      entries: [
        { type: "column", column: linkerId },
        { type: "column", column: filterId },
      ],
    },
    filters: [],
    sorting: [],
  });
  const parents = res.find((v) => v.spec.type === "axis" && v.spec.spec.name === PARENT_ID_AXIS);
  return new Set(Array.from((parents?.data.data ?? []) as ArrayLike<unknown>, String));
}

watch(
  () => ({
    pframe: app.model.outputs.stateMatrixPf,
    colId: app.model.outputs.stateMatrixColId,
    subset: app.model.outputs.subsetParentsFrame,
  }),
  async ({ pframe, colId, subset }) => {
    if (!pframe || !colId) {
      parentOptions.value = [];
      return;
    }
    try {
      const res = await getUniqueSourceValuesWithLabels(pframe, {
        columnId: colId as PObjectId,
        axisIdx: 1,
      });
      const all = res.values.map((v) => ({ value: v.value, label: v.label }));
      // An empty subset reaches no parent; every parent then shows the same empty plot.
      const inSubset = subset?.frame
        ? await subsetParents(subset.frame, subset.linkerId, subset.filterId)
        : undefined;
      const reached = inSubset && all.filter((o) => inSubset.has(o.value));
      parentOptions.value = reached && reached.length > 0 ? reached : all;
      const current = app.model.data.selectedParentId;
      if (parentOptions.value.length > 0 && !parentOptions.value.some((o) => o.value === current)) {
        app.model.data.selectedParentId = parentOptions.value[0].value;
      }
    } catch {
      parentOptions.value = [];
    }
  },
  { immediate: true },
);

// Options for the dropdown. While the async enumeration is still loading (e.g. the Settings
// panel was just reopened and the component remounted), fall back to the persisted selection so
// the dropdown shows it as valid instead of flashing empty for a moment.
const parentOptionsDisplay = computed(() => {
  if (parentOptions.value.length > 0) return parentOptions.value;
  const current = app.model.data.selectedParentId;
  return current ? [{ value: current, label: current }] : [];
});
</script>

<template>
  <!-- GraphMaker gives the block's settings slot no width, so without this the drawer grows to
       fit the longest line of text. The gap replaces the one this wrapper displaces. -->
  <div class="settings">
    <PlDatasetSelector
      v-model="stateMatrixSelection"
      :options="app.model.outputs.stateMatrixOptions"
      label="Select dataset"
      clearable
      required
    />

    <PlDropdown
      :model-value="app.model.data.selectedParentId"
      :options="parentOptionsDisplay"
      label="Parent"
      required
      @update:model-value="(v?: string) => (app.model.data.selectedParentId = v ?? undefined)"
    >
      <template #tooltip> Select parent (alignment reference). </template>
    </PlDropdown>

    <!-- Per-variant scores plotted at their own substitution's cell. Top level, not an
         accordion: this is the landing page's only input, so it should not need a click. -->
    <PlDropdownMulti
      :model-value="app.model.data.scoreRefs"
      :options="app.model.outputs.scoreOptions ?? []"
      label="Score columns"
      clearable
      @update:model-value="(v: SUniversalPColumnId[]) => (app.model.data.scoreRefs = v)"
    >
      <template #tooltip>
        The number that colours each cell. Pick a value measured for each variant, such as a
        Tite-Seq affinity or a Sort-Seq bin score. Each cell shows the single mutant carrying that
        one substitution, and its own measured value. Values are never averaged over other variants
        sharing the substitution. A cell stays blank when no single mutant carried it.
      </template>
    </PlDropdownMulti>

    <PlElementList
      v-if="app.model.data.scoreRefs.length > 0"
      v-model:items="app.model.data.scoreRefs"
    >
      <template #item-title="{ item }">{{ scoreLabel(item) }}</template>
    </PlElementList>
    <div
      v-if="app.model.data.scoreRefs.length > 1"
      style="font-size: 12px; color: #888; margin-top: -8px"
    >
      One chart per score, one tab each, in this order; drag to reorder. Each chart has its own
      colour scale, so scores measured in different units are fine.
    </div>

    <!-- Composition-enrichment view: positional log2 fold change across selection rounds. -->
    <PlAccordionSection v-model="compositionOpen" label="Enrichment Analysis">
      <PlDropdownMulti
        :model-value="app.model.data.roundFrequencyRefs"
        :options="app.model.outputs.roundFrequencyOptions ?? []"
        label="Round frequencies (from Enrichment)"
        clearable
        @update:model-value="(v: SUniversalPColumnId[]) => (app.model.data.roundFrequencyRefs = v)"
      >
        <template #tooltip>
          Per-round, per-variant frequency columns exported by an upstream Enrichment block. Pick
          the rounds to compare; the heatmap shows, per position and residue, the log2 fold change
          of the residue composition in each round versus the baseline round. Adds the "Enrichment
          Analysis" page.
        </template>
      </PlDropdownMulti>

      <PlElementList
        v-if="app.model.data.roundFrequencyRefs.length > 0"
        v-model:items="app.model.data.roundFrequencyRefs"
      >
        <template #item-title="{ item }">{{ roundLabel(item) }}</template>
      </PlElementList>
      <div
        v-if="app.model.data.roundFrequencyRefs.length > 0"
        style="font-size: 12px; color: #888; margin-top: -8px"
      >
        The first round is the baseline (R0); drag to reorder.
      </div>
    </PlAccordionSection>
  </div>
</template>

<style scoped>
.settings {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
