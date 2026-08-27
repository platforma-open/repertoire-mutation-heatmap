# Overview

Maps the per-variant repertoire produced by the **Amplicon Profiling** block onto its parent (reference) sequence, position by position and residue by residue. It is built for deep mutational scanning (DMS), phage or yeast display selections, and affinity-maturation campaigns — wherever you need to see *which mutations matter* across a designed antibody/TCR library.

Both views share the same frame: X is the position in the parent sequence, Y is the residue. The whole plot is scoped to one parent, picked in Settings, because positions are only comparable within the same reference frame. The parent residue at each position rides under the X axis as an annotation track, so the reference sequence reads straight off the map; where the profiler supplied a region scheme, a region-membership track sits alongside it and shows the domain boundaries.

The **Single Mutation Landscape** plots per-variant scores, such as a binding affinity from Tite-Seq or an averaged-bin value from Sort-Seq, supplied by an upstream assay block. Only single-mutant variants are used, so each cell holds the value of the one variant carrying exactly that substitution. Nothing is averaged over genetic backgrounds, which makes the map read as a per-mutation effect rather than a population summary. Cells that no single mutant covers stay empty. Each selected score gets its own chart with its own colour scale, so scores measured in different units stay readable. Tabs above the plot switch between them.

**Enrichment Analysis** compares selection rounds. Given the per-round, per-variant frequency columns exported by an upstream Enrichment block, it shows the log2 fold change of residue composition in each round against the baseline round. One panel per non-baseline round; positive and negative changes are coloured on a diverging scale, so residues gaining and losing ground separate at a glance.

This block consumes the outputs of the Amplicon Profiling block directly; pair the two to go from raw amplicon reads to interpretable mutation maps.

This block is built on the Platforma SDK and its GraphMaker visualization engine, developed by MiLaboratories Inc. For more information, please see the [MiLaboratories website](https://milaboratories.com/).
