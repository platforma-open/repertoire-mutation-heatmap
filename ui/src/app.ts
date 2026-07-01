import { platforma } from "@platforma-open/milaboratories.repertoire-mutation-heatmap.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import MainPage from "./MainPage.vue";
import KnownHeatmapPage from "./KnownHeatmapPage.vue";
import CompositionHeatmapPage from "./CompositionHeatmapPage.vue";

export const sdkPlugin = defineAppV3(platforma, (app) => ({
  progress: () => app.model.outputs.isRunning,
  routes: {
    "/": () => MainPage,
    "/composition": () => CompositionHeatmapPage,
    "/known-heatmap": () => KnownHeatmapPage,
  },
}));

export const useApp = sdkPlugin.useApp;
