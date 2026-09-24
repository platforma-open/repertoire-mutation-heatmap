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
co-occurrence count, the mutation-to-variant linker, and the partner pair map. A library with no
multi-mutants produces an empty pair map and costs nothing.

Variants of any mutation count are covered: the Table tab lists every variant carrying the
substitution, triples and beyond included, while the partner map draws doubles — which is what a
partner map is.

The ptabler step's RAM request is now set explicitly. It was sized from `f.size()`, which counts
only inputs attached with `addFile()`, and this workflow attaches none — everything is read
through `pt.p.column`. So the measured volume was zero and the run always received the 2 GiB
floor, whatever the library: a ~1M variant profiling run gives a ~118M row state matrix and got
the same request as a 2M row one. This affected the block before this feature existed.

The landscape's tooltip now carries a **Co-occurring variants** count, so a cell says whether it
has anything to browse before the click is spent. It is worth showing for its own sake: it says
how well a substitution has been explored in combination, which is a fact about the library.

A drill-down is opened by clicking the cell. A cell with nothing to browse answers when asked:
clicking it explains why — the substitution is carried by no multi-mutant, or the cell is the
parent residue and names no substitution at all. Nothing is announced up front, and no click is
silently ignored, which is what made an empty dataset read as a broken block. Only cells with at least one co-occurring variant
respond — the rest would open a browser holding nothing but the singleton just clicked, so they
keep the default cursor and do nothing.
