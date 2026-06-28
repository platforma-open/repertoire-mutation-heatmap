import { platforma } from "@platforma-open/milaboratories.repertoire-mutation-heatmap.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import MainPage from "./MainPage.vue";
import KnownHeatmapPage from "./KnownHeatmapPage.vue";

export const sdkPlugin = defineAppV3(platforma, (app) => ({
  progress: () => app.model.outputs.isRunning,
  routes: {
    "/": () => MainPage,
    "/known-heatmap": () => KnownHeatmapPage,
  },
}));

export const useApp = sdkPlugin.useApp;
