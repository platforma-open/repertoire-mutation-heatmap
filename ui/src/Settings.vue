<script setup lang="ts">
import type { PObjectId, SUniversalPColumnId } from "@platforma-sdk/model";
import { getUniqueSourceValuesWithLabels } from "@platforma-sdk/model";
import {
  PlAccordionSection,
  PlDropdown,
  PlDropdownMulti,
  PlDropdownRef,
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
type StateMatrixRef = NonNullable<typeof app.model.data.stateMatrixRef>;
function onSelectStateMatrix(ref: StateMatrixRef | undefined) {
  app.model.data.stateMatrixRef = ref;
  // Clear the parent: it belongs to the previous dataset. selectedParentId is required in
  // args, so this holds the workflow (uncalculated) until the options watch auto-selects a
  // valid default — avoiding a run over a stale/mismatched selection.
  app.model.data.selectedParentId = undefined;
  app.model.data.defaultBlockLabel =
    app.model.outputs.stateMatrixOptions?.find(
      (o) => ref && o.ref.blockId === ref.blockId && o.ref.name === ref.name,
    )?.label ?? "";
}

// Enumerate the available parents from the state matrix's parentId axis (idx 1) — straight from
// the result pool, so the selector is populated before the main workflow runs. Then auto-select
// the first parent when nothing valid is chosen. The write targets `selectedParentId`, but the
// options come from `stateMatrixPf` (which does NOT depend on it), so this can't loop — the same
// safe, deterministic default-selection shape as the block-label pattern.
const parentOptions = ref<{ value: string; label: string }[]>([]);
watch(
  () => ({
    pframe: app.model.outputs.stateMatrixPf,
    colId: app.model.outputs.stateMatrixColId,
  }),
  async ({ pframe, colId }) => {
    if (!pframe || !colId) {
      parentOptions.value = [];
      return;
    }
    try {
      const res = await getUniqueSourceValuesWithLabels(pframe, {
        columnId: colId as PObjectId,
        axisIdx: 1,
      });
      parentOptions.value = res.values.map((v) => ({ value: v.value, label: v.label }));
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
  <PlDropdownRef
    :model-value="app.model.data.stateMatrixRef"
    :options="app.model.outputs.stateMatrixOptions"
    label="Select dataset"
    clearable
    required
    @update:model-value="onSelectStateMatrix"
  >
  </PlDropdownRef>

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
      The number that colours each cell. Pick a value measured for each variant, such as a Tite-Seq
      affinity or a Sort-Seq bin score. Each cell shows the single mutant carrying that one
      substitution, and its own measured value. Values are never averaged over other variants sharing
      the substitution. A cell stays blank when no single mutant carried it.
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
    Panels render in this order; drag to reorder. All panels share one colour scale, so compare
    scores measured on the same units.
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
        Per-round, per-variant frequency columns exported by an upstream Enrichment block. Pick the
        rounds to compare; the heatmap shows, per position and residue, the log2 fold change of the
        residue composition in each round versus the baseline round. Adds the "Enrichment Analysis"
        page.
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
</template>
