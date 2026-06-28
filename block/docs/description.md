# Overview

Visualizes the per-variant repertoire produced by the **Amplicon Repertoire Profiling** block as mutation-enrichment heat maps. It is built for deep mutational scanning (DMS), phage or yeast display selections, and affinity-maturation campaigns — wherever you need to see *which mutations are enriched* across a designed antibody/TCR library.

The headline view is a position × residue heat map: for every position in a parent (reference) sequence, each cell summarizes the variants carrying a given residue at that position. Cells are coloured by aggregated abundance, or — by default — by per-position **state frequency**, the canonical enrichment readout in which each position column sums to one. The map is faceted by parent, since positions are only comparable within the same reference frame.

A live filter selects the variant subset before aggregation and shows it **side by side with the unfiltered baseline**. Restrict the subset by sample or selection round, or by a per-variant property range — for example a Tite-Seq dissociation constant (Kd) — to ask "which mutations are enriched among the high-affinity binders?". Changing the filter re-runs the aggregation. Cells can instead be coloured by the **mean of a per-variant property** (such as binding affinity) across the variants carrying each residue, turning the same map into a property landscape.

A second heat map shows known-variant × sample abundance, rendered directly from the profiler's pre-aggregated counts — useful for tracking designed variants across samples or selection rounds.

This block consumes the outputs of the Amplicon Repertoire Profiling block directly; pair the two to go from raw amplicon reads to interpretable enrichment maps. Filtering or colouring by a measured property additionally uses a per-variant property column (e.g. a Kd) supplied by an upstream assay block.

This block is built on the Platforma SDK and its GraphMaker visualization engine, developed by MiLaboratories Inc. For more information, please see the [MiLaboratories website](https://milaboratories.com/).
