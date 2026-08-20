---
'@platforma-open/milaboratories.repertoire-mutation-heatmap.model': patch
'@platforma-open/milaboratories.repertoire-mutation-heatmap.block': patch
---

Upgrade the SDK to block-tools 2.14.3 and add the required kind package

Catalog: model 1.79.27 -> 1.82.0, ui-vue 1.79.27 -> 1.82.1, workflow-tengo 6.6.5 -> 6.8.2,
block-tools 2.11.10 -> 2.14.3, tengo-builder 4.0.15 -> 4.0.23, test 1.79.28 -> 1.82.4,
package-builder 3.14.0 -> 3.15.0, ts-builder 1.6.0 -> 1.7.0, ts-configs 1.3.0 -> 1.4.0,
plus a new block-kind 1.1.0.

block-tools 2.14.x makes a sibling `kind/` package mandatory. It declares the block's
identity and its init-params contract. The contract is deliberately empty: every input is a
result-pool reference the user picks after creation, so a template cannot name one.

The model moves onto the kind-carrying API — `new DataModelBuilder({ kind })` and
`BlockModelV3.create({ dataModel, kind })` — and gains the now-required `templateParams()`
projection, which returns `{}` to match the empty contract.

`ColumnCollectionBuilder` was retired from the SDK. Both discovery outputs move to
`ColumnsCollection(["result_pool"]).discover(...).getColumns()`. Two behaviour notes: the new
API returns one recipe per reachability variant where the old one merged them, so the
round-frequency options now dedup by leaf id; and a selector name given as a bare string
normalizes to a regex, so `pl7.app/frequency` is spelled as an explicit exact matcher.
