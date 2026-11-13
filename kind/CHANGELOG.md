# @platforma-open/milaboratories.repertoire-mutation-heatmap.kind

## 1.1.0

### Minor Changes

- 4f66c77: Keep the settings in a project template. A project made from a template came with Mutation Explorer on "No dataset selected", so it could not run until everything was picked again by hand. The kind now carries the dataset, its subset, the parent and the score columns, and the block made from a template points at the columns of the project being made.

## 1.0.2

### Patch Changes

- 9ed7f9e: Remove the Enrichment Analysis section

  - Drop the composition-enrichment view: the "Enrichment Analysis" settings section, its page, and its sidebar link
  - Stop reading per-round frequency columns and computing the per-position log2 fold change map
  - The mutation landscape and drill-down views are unchanged, including scores that come from Enrichment blocks

## 1.0.1

### Patch Changes

- 4d6dda2: Clear selected score and enrichment columns on dataset change
