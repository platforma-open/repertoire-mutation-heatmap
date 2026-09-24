---
"@platforma-open/milaboratories.repertoire-mutation-heatmap.block": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.model": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.ui": patch
---

MILAB-6876: build against released dependencies

`@milaboratories/graph-maker` 1.8.0 -> 1.9.0, the release that carries the heat map `@cell-click`
event this feature is built on. The block was developed against local builds of graph-maker,
miplots4, pf-plots, model, ui-vue and uikit, pinned through `pnpm.overrides` and a `file:` path on
the model package while that work was unreleased. All of it is published now, so the overrides are
gone and the lockfile resolves from the registry alone.
