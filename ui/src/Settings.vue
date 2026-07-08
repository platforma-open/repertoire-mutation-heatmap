<script setup lang="ts">
import type {
  Alphabet,
  VariantFilter,
} from "@platforma-open/milaboratories.repertoire-mutation-heatmap.model";
import type { PObjectId, SUniversalPColumnId } from "@platforma-sdk/model";
import { getSingleColumnData, getUniqueSourceValuesWithLabels } from "@platforma-sdk/model";
import {
  PlAccordionSection,
  PlCheckbox,
  PlDropdown,
  PlDropdownMulti,
  PlDropdownRef,
  PlElementList,
  PlNumberField,
  PlTooltip,
} from "@platforma-sdk/ui-vue";
import { computed, ref, watch } from "vue";
import { useApp } from "./app";

const app = useApp();

const filterOpen = ref(false);
const compositionOpen = ref(false);

// Human label for a selected round-frequency column, from the discovery options.
function roundLabel(ref: SUniversalPColumnId): string {
  const opts = app.model.outputs.roundFrequencyOptions ?? [];
  return opts.find((o) => o.value === ref)?.label ?? String(ref);
}

// Snapshot the picked dataset's name into data on selection — the model's args-only
// `.subtitle` reads it from there (it can't resolve the label live). A user-gesture write,
// not an output→data watchEffect, so no hairpin.
type StateMatrixRef = NonNullable<typeof app.model.data.stateMatrixRef>;
function onSelectStateMatrix(ref: StateMatrixRef | undefined) {
  app.model.data.stateMatrixRef = ref;
  // Clear the parent and abundance: both belong to the previous dataset. With selectedParentId
  // (and abundance) required in args, this holds the workflow (uncalculated) until the options
  // watches auto-select valid defaults — avoiding a run over a stale/mismatched selection.
  app.model.data.selectedParentId = undefined;
  app.model.data.abundanceRef = undefined;
  app.model.data.defaultBlockLabel =
    app.model.outputs.stateMatrixOptions?.find(
      (o) => ref && o.ref.blockId === ref.blockId && o.ref.name === ref.name,
    )?.label ?? "";
}

// Replace the whole filter object on every edit (data is persisted server-side;
// keep writes immutable rather than mutating nested fields in place).
function patchFilter(patch: Partial<VariantFilter>) {
  app.model.data.filter = { ...app.model.data.filter, ...patch };
}

function setRangeMin(v: number | undefined) {
  patchFilter({ range: [v ?? null, app.model.data.filter.range?.[1] ?? null] });
}
function setRangeMax(v: number | undefined) {
  patchFilter({ range: [app.model.data.filter.range?.[0] ?? null, v ?? null] });
}

// Enumerate {sampleId, label} for the sample-selection multiselect from the
// abundance column's sampleId axis (via the anchored label column).
const sampleOptions = ref<{ value: string; label: string }[]>([]);
watch(
  () => ({
    pframe: app.model.outputs.sampleLabelPframe,
    colId: app.model.outputs.sampleLabelColId,
  }),
  async ({ pframe, colId }) => {
    if (!pframe || !colId) {
      sampleOptions.value = [];
      return;
    }
    try {
      const { data, axesData } = await getSingleColumnData(pframe, colId as PObjectId);
      const keys = (Object.values(axesData)[0] ?? []) as unknown[];
      const labels = data as unknown[];
      sampleOptions.value = keys
        .map((k, i) => ({ value: String(k), label: String(labels[i] ?? k) }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    } catch {
      sampleOptions.value = [];
    }
  },
  { immediate: true },
);

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

// Default the abundance to the first option once a dataset is chosen — and re-default when the
// dataset changes (onSelectStateMatrix clears the stale ref, and this re-fires because it's keyed
// on stateMatrixRef). Gated on a dataset being selected so nothing is picked before then, matching
// the parent selector. abundanceOptions is dataset-scoped (same run as the state matrix) and does
// not depend on abundanceRef, so the default is always correct and this can't loop.
watch(
  () => ({
    dataset: app.model.data.stateMatrixRef,
    options: app.model.outputs.abundanceOptions,
  }),
  ({ dataset, options }) => {
    if (!dataset || !options || options.length === 0) return;
    const cur = app.model.data.abundanceRef;
    const valid =
      !!cur && options.some((o) => o.ref.blockId === cur.blockId && o.ref.name === cur.name);
    if (!valid) {
      app.model.data.abundanceRef = options[0].ref;
    }
  },
  { immediate: true },
);
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

  <PlDropdownRef
    v-model="app.model.data.abundanceRef"
    :options="app.model.outputs.abundanceOptions"
    label="Abundance"
    clearable
    required
  >
    <template #tooltip>
      Choose your variants' abundance — read counts or fractions. The heatmap colours each residue
      by how abundant the variants carrying it are.
    </template>
  </PlDropdownRef>

  <PlTooltip position="left">
    <PlCheckbox
      :model-value="app.model.data.normalize"
      @update:model-value="(v: boolean) => (app.model.data.normalize = v)"
    >
      Normalize to per-position residue frequency
    </PlCheckbox>
    <template #tooltip>
      Show each cell as the fraction of the variant subset carrying that residue at that position,
      so every position column adds up to 100% (the enrichment view). Turn off to colour by raw
      summed abundance instead.
    </template>
  </PlTooltip>

  <PlDropdownRef
    v-model="app.model.data.knownAbundanceRef"
    :options="app.model.outputs.knownAbundanceOptions"
    label="Known-variant abundance"
    clearable
  >
    <template #tooltip>
      How abundant each known variant (the designed set you supplied to the Amplicon Repertoire
      Profiling block) is in each sample. Adds the "Known Variants" heatmap. Optional — leave empty
      if your run had no known set.
    </template>
  </PlDropdownRef>

  <!-- Subset filter: a filtered facet shown beside the unfiltered baseline. -->
  <PlAccordionSection v-model="filterOpen" label="Subset filter (vs baseline)">
    <PlDropdownMulti
      :model-value="app.model.data.filter.sampleSelection ?? []"
      :options="sampleOptions"
      label="Samples"
      clearable
      @update:model-value="(v: string[]) => patchFilter({ sampleSelection: v })"
    >
      <template #tooltip>
        Build the "Filtered" heatmap from only these samples, shown next to the all-samples
        baseline. Leave empty to include every sample.
      </template>
    </PlDropdownMulti>

    <PlDropdown
      :model-value="app.model.data.filter.propertyRef"
      :options="app.model.outputs.propertyOptions ?? []"
      label="Filter by property"
      clearable
      @update:model-value="
        (v?: string) =>
          patchFilter({ propertyRef: (v as VariantFilter['propertyRef']) ?? undefined })
      "
    >
      <template #tooltip>
        Keep only variants whose per-variant property (e.g. a Tite-Seq Kd) falls in the range below.
        Drives the "Filtered" facet.
      </template>
    </PlDropdown>

    <PlNumberField
      v-if="app.model.data.filter.propertyRef"
      :model-value="app.model.data.filter.range?.[0] ?? undefined"
      label="Min"
      :clearable="true"
      @update:model-value="setRangeMin"
    />
    <PlNumberField
      v-if="app.model.data.filter.propertyRef"
      :model-value="app.model.data.filter.range?.[1] ?? undefined"
      label="Max"
      :clearable="true"
      @update:model-value="setRangeMax"
    />
  </PlAccordionSection>

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
