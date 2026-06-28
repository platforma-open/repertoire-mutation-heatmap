<script setup lang="ts">
import type {
  ValueMode,
  Alphabet,
  VariantFilter,
} from "@platforma-open/milaboratories.repertoire-mutation-heatmap.model";
import type { PObjectId } from "@platforma-sdk/model";
import { getSingleColumnData } from "@platforma-sdk/model";
import {
  PlAccordionSection,
  PlBtnGroup,
  PlCheckbox,
  PlDropdown,
  PlDropdownMulti,
  PlDropdownRef,
  PlNumberField,
  PlTooltip,
} from "@platforma-sdk/ui-vue";
import { ref, watch } from "vue";
import { useApp } from "./app";

const app = useApp();

const valueModeOptions: { label: string; value: ValueMode }[] = [
  { label: "Abundance", value: "abundance" },
  { label: "Property", value: "property" },
];

const levelOptions: { label: string; value: Alphabet }[] = [
  { label: "Amino acid", value: "aminoacid" },
  { label: "Nucleotide", value: "nucleotide" },
];

const filterOpen = ref(false);

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
</script>

<template>
  <PlDropdownRef
    v-model="app.model.data.stateMatrixRef"
    :options="app.model.outputs.stateMatrixOptions"
    label="Variant residues"
    clearable
    required
  >
    <template #tooltip>
      The per-variant residue data from the Amplicon Repertoire Profiling block — the amino acid (or
      nucleotide) each variant carries at every aligned position. Choose the amino-acid or
      nucleotide version; the heatmap plots position × residue.
    </template>
  </PlDropdownRef>

  <PlBtnGroup v-model="app.model.data.valueMode" :options="valueModeOptions" label="Colour by">
    <template #tooltip>
      What each cell's colour represents. <b>Abundance</b> — how abundant the variants carrying that
      residue are. <b>Property</b> — the average of a measured per-variant property (e.g. a binding
      affinity) across those variants.
    </template>
  </PlBtnGroup>

  <PlDropdownRef
    v-if="app.model.data.valueMode === 'abundance'"
    v-model="app.model.data.abundanceRef"
    :options="app.model.outputs.abundanceOptions"
    label="Abundance"
    clearable
    required
  >
    <template #tooltip>
      How abundant each variant is in each sample — read counts or fractions from the Amplicon
      Repertoire Profiling block. Cells sum this over the variants carrying each residue at each
      position.
    </template>
  </PlDropdownRef>

  <PlDropdown
    v-if="app.model.data.valueMode === 'property'"
    v-model="app.model.data.propertyRef"
    :options="app.model.outputs.propertyOptions ?? []"
    label="Per-variant property"
    clearable
    required
  >
    <template #tooltip>
      A measured value attached to each variant — for example a binding affinity (Tite-Seq Kd) from
      an upstream assay block. Each cell shows the average of this value across the variants
      carrying that residue at that position.
    </template>
  </PlDropdown>

  <PlTooltip v-if="app.model.data.valueMode === 'abundance'" position="left">
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

  <PlBtnGroup v-model="app.model.data.level" :options="levelOptions" label="Level" />

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
</template>
