<script setup lang="ts">
import type { PredefinedGraphOption } from "@milaboratories/graph-maker";
import { GraphMaker } from "@milaboratories/graph-maker";
import {
  PlAgDataTableV2,
  PlBlockPage,
  PlBtnGhost,
  PlTabs,
  usePlDataTableSettingsV2,
} from "@platforma-sdk/ui-vue";
import { computed, watch } from "vue";
import { drillDownLabel } from "@platforma-open/milaboratories.repertoire-mutation-heatmap.model";
import { useApp } from "./app";
import { useDrillDowns } from "./drillDown";

const app = useApp<`/drilldown?m=${string}`>();
const { close } = useDrillDowns();

// The section href carries the substitution, so the page is addressable and one route serves
// every open drill-down.
const mutationId = computed(() => decodeURIComponent(app.queryParams.m ?? ""));

const drillDown = computed(() =>
  app.model.data.drillDowns.find((d) => d.mutationId === mutationId.value),
);

// The model has no route access, so the page tells it which substitution the table should be
// filtered to. Written on arrival and whenever the route changes under us.
watch(
  mutationId,
  (id) => {
    if (id && app.model.data.activeDrillDown !== id) {
      app.model.data.activeDrillDown = id;
    }
  },
  { immediate: true },
);

const TABS = [
  { value: "table", label: "Table" },
  { value: "heatmap", label: "Heatmap" },
];

const pCols = computed(() => app.model.outputs.drillDownHeatmapPCols);

/** The pair value column for the score this drill-down was opened from. */
const valueCol = computed(() => {
  const cols = pCols.value;
  const key = drillDown.value?.scoreKey;
  if (!cols || key === undefined) return undefined;
  return cols.find(
    (c) =>
      c.spec.name === "pl7.app/repertoire/pairMutantValue" &&
      c.spec.annotations?.["pl7.app/repertoire/landscapeScoreRef"] === key,
  );
});

/** Same string the section list shows, built by the same function so the two cannot drift. */
const pageTitle = computed(() =>
  drillDown.value ? drillDownLabel(drillDown.value) : mutationId.value,
);

/** Companion columns of the same score — matched on the score index, which is in their domain. */
function companion(name: string) {
  const index = valueCol.value?.spec.domain?.["pl7.app/repertoire/landscapeScore"];
  if (index === undefined) return undefined;
  return pCols.value?.find(
    (c) => c.spec.name === name && c.spec.domain?.["pl7.app/repertoire/landscapeScore"] === index,
  );
}

const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.drillDownTable,
});

const defaultOptions = computed((): PredefinedGraphOption<"heatmap">[] | undefined => {
  const value = valueCol.value;
  const axes = value?.spec.axesSpec;
  // Axis order is the workflow's: [mutationId, position, state].
  if (!value || !axes || axes.length < 3) return undefined;

  const options: PredefinedGraphOption<"heatmap">[] = [
    { inputName: "value", selectedSource: value.spec },
    { inputName: "x", selectedSource: axes[1] }, // position
  ];

  // Parent residue as the second part of the X label ("32, D"), exactly as the landscape draws
  // it — the two maps share the position axis, so they must read alike.
  const parentCol = pCols.value?.find((p) => p.spec.name === "pl7.app/repertoire/parentResidue");
  if (parentCol) options.push({ inputName: "x", selectedSource: parentCol.spec });

  options.push({ inputName: "y", selectedSource: axes[2] }); // state

  // What a cell IS: the partner substitution, and the double mutant that carries the pair.
  const partner = companion("pl7.app/repertoire/partnerMutation");
  if (partner) options.push({ inputName: "tooltipContent", selectedSource: partner.spec });
  const variant = companion("pl7.app/repertoire/pairVariantKey");
  if (variant) options.push({ inputName: "tooltipContent", selectedSource: variant.spec });

  const regionCol = pCols.value?.find((p) => p.spec.name === "pl7.app/repertoire/regionAnnotation");
  if (regionCol) options.push({ inputName: "annotationsX", selectedSource: regionCol.spec });

  // Outline the fixed mutation's own cell — the reference every pair is read against. Present
  // only there, so `subset` ("has a value") marks exactly it. Same mechanism as the landscape's
  // parent-residue outline.
  const fixedFlag = pCols.value?.find((p) => p.spec.name === "pl7.app/repertoire/isFixedMutation");
  if (fixedFlag) {
    options.push({
      inputName: "highlight",
      selectedSource: fixedFlag.spec,
      filterType: "subset",
    });
  }

  return options;
});

// Pin the map to this substitution. Through `fixedOptions`, not `defaultOptions`: those are
// hidden from every picker (their sources go to calculateOptions as fixedIds), never written
// into the saved chart state, and APPENDED to the basket rather than owning it — so the user
// keeps the Filter basket for their own filters. That is also why `filters` is deliberately
// absent from `readonly-inputs` below.
const fixedOptions = computed((): PredefinedGraphOption<"heatmap">[] | undefined => {
  const axes = valueCol.value?.spec.axesSpec;
  if (!axes || axes.length < 3) return undefined;
  return [
    {
      inputName: "filters",
      selectedSource: axes[0], // mutationId
      filterType: "equals",
      selectedFilterValues: [mutationId.value],
    },
  ];
});
</script>

<template>
  <!-- PlBlockPage, not a hand-rolled header: it supplies the page title styling every other
       block page uses, and the body gutters the table needs. The chart wants the full width,
       so the gutters come off on that tab. -->
  <PlBlockPage v-if="drillDown" :title="pageTitle" :no-body-gutters="drillDown.tab === 'heatmap'">
    <template #append>
      <PlTabs
        :model-value="drillDown.tab"
        :options="TABS"
        :top-line="false"
        @update:model-value="(v: string) => (drillDown!.tab = v as 'table' | 'heatmap')"
      />
      <!-- The block's section list cannot carry a control of its own, so closing lives here.
           Icon only — the cross says it. -->
      <PlBtnGhost icon="close" @click="close(mutationId)" />
    </template>

    <PlAgDataTableV2
      v-if="drillDown.tab === 'table'"
      v-model="drillDown.tableState"
      :settings="tableSettings"
      show-export-button
      :not-ready-text="'Select score columns in Settings, then Run'"
      :no-rows-text="`No variants carry ${mutationId}`"
    />

    <!-- `:key` forces a fresh GraphMaker per substitution: its store is seeded from the state
         object at setup, so swapping the bound state without remounting would carry the previous
         drill-down's settings over and write them into this one's state.

         The chart's own title is empty (see makeDrillDownChartState) — the page title above
         already names the substitution and the score. -->
    <GraphMaker
      v-else
      :key="mutationId"
      v-model="drillDown.heatmapState"
      chartType="heatmap"
      :p-frame="app.model.outputs.drillDownHeatmapPf"
      :defaultOptions="defaultOptions"
      :fixedOptions="fixedOptions"
      :defaultPalette="{ categorical: 'triadic' }"
      :readonly-inputs="['x', 'y', 'value']"
      :status-text="{
        noPframe: { title: 'Run the block to browse variants' },
      }"
    />
  </PlBlockPage>
</template>
