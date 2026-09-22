---
"@platforma-open/milaboratories.repertoire-mutation-heatmap.block": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.model": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.ui": patch
---

MILAB-6876: per-position variant browsing

A cell on the mutation landscape says "A5C scores 0.8". The next question is always the same:
what else did we observe that carries this substitution, and what happened to it there? Browsing
into a substitution now answers it, in a section of its own under the landscape.

- **Table tab** — every observed variant carrying the substitution, from the lone single mutant to
  every combination it appears in, with sequence, mutations, mutation count, abundance and the
  selected scores joined in from the result pool.
- **Heatmap tab** — the double mutants containing it, on the same position x residue grid, where
  each cell is now the *partner* substitution. The fixed mutation is drawn in its own cell and
  outlined, carrying the singleton's own score — the reference every pair is read against. Cells
  with no observed double mutant stay empty; nothing is filled in from a model.

Sections accumulate, so several substitutions can be compared without losing the earlier ones, and
each page carries its own close control. Browsing writes UI state only — it reaches neither `args`
nor `prerunArgs` — so nothing goes stale and no Run button appears. A `v5` migration adds the
field; projects made before this simply have none open.

The workflow precomputes the drill-down for every cell in one run, from data it already had: the
per-variant mutation cells the landscape derives are reused without the `mutationCount == 1`
predicate, so mutation membership needs no designator string parsed. Three new outputs — the
co-occurrence count, the mutation-to-variant linker, and the partner pair map — all bounded by the
variants actually observed rather than by the size of the grid. A library with no multi-mutants
produces an empty pair map and costs nothing.

The landscape's tooltip now carries a **Co-occurring variants** count, so a cell says whether it
has anything to browse before the click is spent. It is worth showing for its own sake: it says
how well a substitution has been explored in combination, which is a fact about the library.

A drill-down is opened by clicking the cell. Only cells with at least one co-occurring variant
respond — the rest would open a browser holding nothing but the singleton just clicked, so they
keep the default cursor and do nothing. Needs the graph-maker release that adds the heat map
`@cell-click` event.
