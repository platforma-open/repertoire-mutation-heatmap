<script setup lang="ts">
import type { PredefinedGraphOption } from "@milaboratories/graph-maker";
import { GraphMaker } from "@milaboratories/graph-maker";
import { computed } from "vue";
import { useApp } from "./app";
import Settings from "./Settings.vue";

const app = useApp();

// Heat map 2: X = sample, Y = known variant (shown via its label), colour =
// known-variant read fraction. Rendered directly from the profiler's
// pre-aggregated [sampleId, knownVariantKey] abundance — no precalc.
const defaultOptions = computed((): PredefinedGraphOption<"heatmap">[] | undefined => {
  const pCols = app.model.outputs.knownHeatmapPCols;
  if (!pCols || pCols.length === 0) return undefined;

  // Prefer the fraction column for colour; fall back to the first abundance column.
  const valueCol =
    pCols.find((p) => p.spec.name === "pl7.app/knownVariantReadFraction") ?? pCols[0];
  if (!valueCol?.spec.axesSpec) return undefined;

  const axes = valueCol.spec.axesSpec; // [sampleId, knownVariantKey]
  return [
    { inputName: "value", selectedSource: valueCol.spec },
    { inputName: "x", selectedSource: axes[0] }, // sampleId
    { inputName: "y", selectedSource: axes[1] }, // knownVariantKey (shown via label)
  ];
});
</script>

<template>
  <GraphMaker
    v-model="app.model.data.knownHeatmapState"
    chartType="heatmap"
    :p-frame="app.model.outputs.knownHeatmapPf"
    :defaultOptions="defaultOptions"
    :readonly-inputs="['x', 'y', 'value']"
    :status-text="{ noPframe: { title: 'Select a known × sample abundance column in Settings' } }"
  >
    <template #settingsSlot>
      <Settings />
    </template>
  </GraphMaker>
</template>
