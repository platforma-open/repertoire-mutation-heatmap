<script setup lang="ts">
import type { PredefinedGraphOption } from "@milaboratories/graph-maker";
import { GraphMaker } from "@milaboratories/graph-maker";
import { makeLandscapeChartState } from "@platforma-open/milaboratories.repertoire-mutation-heatmap.model";
import { PlTabs } from "@platforma-sdk/ui-vue";
import { computed, watch } from "vue";
import { useApp } from "./app";
import Settings from "./Settings.vue";

const app = useApp();

// One chart per score: a heatmap chart has a single colour scale, so scores in different units
// cannot share one.
//
// Only one is on screen at a time, picked by the tabs. Stacking them needs a graph-maker fix:
// it mounts every chart into a hardcoded DOM id (`chartSvgContainer`), so a second instance on
// the page lands in the first one's container. Its settings-modal teleport target and miplots4's
// tooltip lookup are shared the same way.
const panels = computed(() => app.model.outputs.landscapePanels ?? []);

const tabOptions = computed(() => panels.value.map((p) => ({ value: p.key, label: p.label })));

// Falls back to the first score when nothing is chosen, or the chosen one is gone. Read-only, so
// a dropped score costs no write to data.
const activePanel = computed(() => {
  const list = panels.value;
  const chosen = list.find((p) => p.key === app.model.data.selectedLandscapeScore);
  return chosen ?? list[0];
});

// Seed a chart's saved settings the first time it appears, so `v-model` has something to bind.
// Not a hairpin: the states reach neither args nor any output, and two clients racing here write
// the same default for the same key.
watch(
  panels,
  (list) => {
    const states = app.model.data.singleMutantHeatmapStates;
    for (const panel of list) {
      if (states[panel.key] === undefined) {
        states[panel.key] = makeLandscapeChartState(panel.label, null);
      }
    }
  },
  { immediate: true },
);

// Close the Settings drawer when a run starts. Idempotent, and currentTab does not feed back
// into isRunning, so not a hairpin.
watch(
  () => app.model.outputs.isRunning,
  (isRunning, wasRunning) => {
    if (!isRunning || wasRunning) return;
    app.model.data.singleMutantHeatmapState.currentTab = null;
    for (const state of Object.values(app.model.data.singleMutantHeatmapStates)) {
      state.currentTab = null;
    }
  },
);

// Tracks under the position (X) axis. Position-keyed, so the same two columns serve every score.
// Region only when the profiler supplied a region scheme.
const annotationOptions = computed((): PredefinedGraphOption<"heatmap">[] => {
  const pCols = app.model.outputs.singleMutantHeatmapPCols;
  if (!pCols) return [];
  const options: PredefinedGraphOption<"heatmap">[] = [];
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

// X = position, Y = state, colour = the single-mutant variant's own score. A cell is NOT a
// population marginal — it is one variant's value, so nothing averages over genetic backgrounds.
//
// GraphMaker finds the value column by matching the whole spec it is handed — domain and
// annotations included — which is what tells the score columns apart: they share name and axes.
const defaultOptions = computed((): PredefinedGraphOption<"heatmap">[] | undefined => {
  const spec = activePanel.value?.spec;
  const axes = spec?.axesSpec;
  if (!spec || !axes) return undefined;
  // Axis order: [position, state]. GraphMaker requires every axis of a heatmap's value column to
  // be consumed by an input; x and y take both, so no selector appears above the plot.
  return [
    { inputName: "value", selectedSource: spec },
    { inputName: "x", selectedSource: axes[0] }, // position
    { inputName: "y", selectedSource: axes[1] }, // state
    { inputName: "tooltipContent", selectedSource: axes[1] }, // show State in the tooltip
    ...annotationOptions.value,
  ];
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

    `:key` forces a fresh GraphMaker per score: its store is seeded from the state object at
    setup, so swapping the bound state without remounting would carry the previous score's
    settings over and write them into the new score's state.
  -->
  <GraphMaker
    v-if="activePanel"
    :key="activePanel.key"
    v-model="app.model.data.singleMutantHeatmapStates[activePanel.key]"
    chartType="heatmap"
    :p-frame="app.model.outputs.singleMutantHeatmapPf"
    :defaultOptions="defaultOptions"
    :defaultPalette="{ categorical: 'triadic' }"
    :readonly-inputs="['x', 'y', 'value']"
  >
    <!-- One tab per score, only with something to switch between. -->
    <template v-if="tabOptions.length > 1" #titleLineSlot>
      <PlTabs
        :model-value="activePanel.key"
        :options="tabOptions"
        :top-line="false"
        @update:model-value="(v: string) => (app.model.data.selectedLandscapeScore = v)"
      />
    </template>
    <template #settingsSlot>
      <Settings />
    </template>
  </GraphMaker>

  <!-- Placeholder: carries the empty state and the Settings drawer, which on a fresh block is
       the only way in to pick a dataset. -->
  <GraphMaker
    v-else
    v-model="app.model.data.singleMutantHeatmapState"
    chartType="heatmap"
    :p-frame="app.model.outputs.singleMutantHeatmapPf"
    :defaultPalette="{ categorical: 'triadic' }"
    :status-text="{
      noPframe: { title: 'Select a dataset and score columns in Settings, then Run' },
    }"
  >
    <template #settingsSlot>
      <Settings />
    </template>
  </GraphMaker>
</template>
