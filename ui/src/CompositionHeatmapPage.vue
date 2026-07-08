<script setup lang="ts">
import type { PredefinedGraphOption } from "@milaboratories/graph-maker";
import { GraphMaker } from "@milaboratories/graph-maker";
import { computed } from "vue";
import { useApp } from "./app";
import Settings from "./Settings.vue";

const app = useApp();

// Composition-enrichment heat map: X = position, Y = state, colour = log2 fold change
// vs the baseline round, tab = parent, facet = round. States from different parents are
// incommensurable, so parentId is a mandatory tab facet; round is a mandatory facet
// (one panel per round).
const defaultOptions = computed((): PredefinedGraphOption<"heatmap">[] | undefined => {
  const pCols = app.model.outputs.compositionHeatmapPCols;
  if (!pCols || pCols.length === 0) return undefined;

  const valueCol = pCols.find((p) => p.spec.name === "pl7.app/repertoire/compositionLog2FC");
  if (!valueCol || !valueCol.spec.axesSpec) return undefined;

  // Import schema axis order: [round, parentId, position, state].
  const axes = valueCol.spec.axesSpec;
  const options: PredefinedGraphOption<"heatmap">[] = [
    { inputName: "value", selectedSource: valueCol.spec },
    { inputName: "x", selectedSource: axes[2] }, // position
    { inputName: "y", selectedSource: axes[3] }, // state
    { inputName: "tabBy", selectedSource: axes[1] }, // parentId — one tab per parent
    { inputName: "facetBy", selectedSource: axes[0] }, // round — one panel per round
    { inputName: "tooltipContent", selectedSource: axes[3] }, // show State in the tooltip
  ];

  // Region + parent-sequence tracks under the position (X) axis — same position-keyed columns
  // as the main heatmap (the workflow adds them to this frame too). Region only when present.
  const regionCol = pCols.find((p) => p.spec.name === "pl7.app/repertoire/regionAnnotation");
  if (regionCol) {
    options.push({ inputName: "annotationsX", selectedSource: regionCol.spec });
  }
  const parentCol = pCols.find((p) => p.spec.name === "pl7.app/repertoire/parentResidue");
  if (parentCol) {
    options.push({ inputName: "annotationsX", selectedSource: parentCol.spec });
  }

  return options;
});
</script>

<template>
  <GraphMaker
    v-model="app.model.data.compositionHeatmapState"
    chartType="heatmap"
    :p-frame="app.model.outputs.compositionHeatmapPf"
    :defaultOptions="defaultOptions"
    :defaultPalette="{ continuous: 'blue_red' }"
    :readonly-inputs="['x', 'y', 'value', 'tabBy', 'facetBy']"
    :status-text="{
      noPframe: {
        title: 'Select round frequencies (from an Enrichment block) in Settings, then Run',
      },
    }"
  >
    <template #settingsSlot>
      <Settings />
    </template>
  </GraphMaker>
</template>
