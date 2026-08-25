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
      app.model.data.singleMutantHeatmapState.currentTab = null;
    }
  },
);

// Mutation landscape: X = position, Y = state, colour = the single-mutant variant's own score,
// tab = parent, facet = score. A cell is NOT a population marginal — it is one variant's value,
// so nothing here averages over genetic backgrounds.
// States from different parents are incommensurable, so parentId stays a mandatory tab facet.
const defaultOptions = computed((): PredefinedGraphOption<"heatmap">[] | undefined => {
  const pCols = app.model.outputs.singleMutantHeatmapPCols;
  if (!pCols || pCols.length === 0) return undefined;

  const valueCol = pCols.find((p) => p.spec.name === "pl7.app/repertoire/singleMutantValue");
  if (!valueCol || !valueCol.spec.axesSpec) return undefined;

  // Import schema axis order: [score, parentId, position, state].
  const axes = valueCol.spec.axesSpec;
  const options: PredefinedGraphOption<"heatmap">[] = [
    { inputName: "value", selectedSource: valueCol.spec },
    { inputName: "x", selectedSource: axes[2] }, // position
    { inputName: "y", selectedSource: axes[3] }, // state
    { inputName: "tabBy", selectedSource: axes[1] }, // parentId — one tab per parent
    { inputName: "facetBy", selectedSource: axes[0] }, // score — one panel per selected score
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
  <!--
    `categorical: 'triadic'` matches the synthetic-repertoire-profiler block, whose state
    heat map renders the same two annotation tracks. It is the only categorical palette
    with enough colours for a residue alphabet: it carries all 27 base colours, where
    light/bright/dark carry 9 each and paired 18. Discrete colours are assigned
    `colors[idx % colors.length]`, so the 9-colour default reuses a colour every 9th
    residue — visible repetition across the 20 residues plus gap on the Parent AA track.
    Past 27 distinct states it still wraps; graph-maker honours only a palette NAME for
    annotation tracks, not an explicit residue->colour map.
  -->
  <GraphMaker
    v-model="app.model.data.singleMutantHeatmapState"
    chartType="heatmap"
    :p-frame="app.model.outputs.singleMutantHeatmapPf"
    :defaultOptions="defaultOptions"
    :defaultPalette="{ categorical: 'triadic' }"
    :readonly-inputs="['x', 'y', 'value', 'tabBy', 'facetBy']"
    :status-text="{
      noPframe: { title: 'Select a dataset and score columns in Settings, then Run' },
    }"
  >
    <template #settingsSlot>
      <Settings />
    </template>
  </GraphMaker>
</template>
