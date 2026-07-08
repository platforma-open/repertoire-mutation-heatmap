<script setup lang="ts">
import type { PredefinedGraphOption } from "@milaboratories/graph-maker";
import { GraphMaker } from "@milaboratories/graph-maker";
import { computed, watch } from "vue";
import { useApp } from "./app";
import Settings from "./Settings.vue";

const app = useApp();

// Close the settings drawer when a run starts (false → true). Idempotent write to
// view state — not a hairpin (currentTab does not feed back into isRunning).
watch(
  () => app.model.outputs.isRunning,
  (isRunning, wasRunning) => {
    if (isRunning && !wasRunning) {
      app.model.data.stateHeatmapState.currentTab = null;
    }
  },
);

// Heat map 1: X = position, Y = state, colour = aggregated abundance, tab = parent.
// States from different parents are incommensurable, so parentId is a mandatory
// tab facet rather than a silently-mixed axis.
const defaultOptions = computed((): PredefinedGraphOption<"heatmap">[] | undefined => {
  const pCols = app.model.outputs.stateHeatmapPCols;
  if (!pCols || pCols.length === 0) return undefined;

  const valueCol = pCols.find((p) => p.spec.name === "pl7.app/repertoire/heatmapValue");
  if (!valueCol || !valueCol.spec.axesSpec) return undefined;

  // Import schema axis order: [subset, parentId, position, state].
  const axes = valueCol.spec.axesSpec;
  const options: PredefinedGraphOption<"heatmap">[] = [
    { inputName: "value", selectedSource: valueCol.spec },
    { inputName: "x", selectedSource: axes[2] }, // position
    { inputName: "y", selectedSource: axes[3] }, // state
    { inputName: "tabBy", selectedSource: axes[1] }, // parentId — one tab per parent
    { inputName: "facetBy", selectedSource: axes[0] }, // subset — All variants vs Filtered, side by side
    { inputName: "tooltipContent", selectedSource: axes[3] }, // show State in the tooltip
  ];

  // Region membership as a discrete annotation track under the position (X) axis — colored
  // region bands aligned to positions, so region boundaries read off the heatmap. The
  // workflow emits it keyed by position alone (collapsed from the profiler's [parentId,
  // position] region annotation), which is what GraphMaker requires for an X annotation:
  // an annotation column's axes must all be X-axis sources, and parentId is tabBy. Present
  // only when the profiler supplied region data (aa state matrix + a region scheme).
  const regionCol = pCols.find((p) => p.spec.name === "pl7.app/repertoire/regionAnnotation");
  if (regionCol) {
    options.push({ inputName: "annotationsX", selectedSource: regionCol.spec });
  }

  // Parent sequence as a second discrete annotation track under the position axis — the parent
  // residue per position (colored by residue; letter shown in the tooltip). Also keyed by
  // position alone, so it satisfies GraphMaker's X-annotation axis rule. Always present (derived
  // from the state matrix), unlike the region track.
  const parentCol = pCols.find((p) => p.spec.name === "pl7.app/repertoire/parentResidue");
  if (parentCol) {
    options.push({ inputName: "annotationsX", selectedSource: parentCol.spec });
  }

  return options;
});
</script>

<template>
  <GraphMaker
    v-model="app.model.data.stateHeatmapState"
    chartType="heatmap"
    :p-frame="app.model.outputs.stateHeatmapPf"
    :defaultOptions="defaultOptions"
    :readonly-inputs="['x', 'y', 'value', 'tabBy']"
    :status-text="{
      noPframe: { title: 'Select a state matrix and abundance in Settings, then Run' },
    }"
  >
    <template #settingsSlot>
      <Settings />
    </template>
  </GraphMaker>
</template>
