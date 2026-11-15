# Data Model Audit

## Scope and provenance

This AI-assisted implementation compares the same saved-order feature in two independent engines. Orders and their related items are the domain entities; the four-product catalog is fixed demonstration data. Reusable prompts are provided in the showcase, not as a transcript of private interactions.

The SQL migration, MongoDB bootstrap, adapters and authorization boundary received independent specification and security reviews before database schema execution. Both reviews approved the inspected implementation. Passing source or controlled-client checks is not live-database proof.

## Relational normalization: 3NF

Source: `supabase/migrations/202611120001_saved_orders.sql`.

| Relation | Candidate keys | Functional dependencies and normalization decision |
|---|---|---|
| `products` | `id`; unique `sku` | Each key determines name, integer unit price and timestamps. Catalog details are stored once, not copied into item rows. |
| `orders` | `id` | Order identity determines its verified owner, label and timestamps. Owner profile/email details are not repeated here. |
| `order_items` | `id`; unique `(order_id, product_id)` | Each key identifies one product membership in one order and determines quantity/timestamps. Product name and price remain in `products`; order label/owner remain in `orders`. |

- **1NF:** each column holds one value; repeated items are separate rows, not an array in an order column.
- **2NF:** non-key attributes depend on the whole candidate key. An item quantity belongs to the specific order/product membership, not to either component alone.
- **3NF:** the modeled non-key attributes do not determine other non-key attributes within a relation. Product details, order details and item membership are separated rather than creating transitive copies.
- Totals are calculated from joined catalog prices and item quantities; no stored order total can drift independently.
- This is a small, immutable catalog demonstration, not a design for historical price changes, inventory or checkout.

## Referential integrity and access boundary

Actual database metadata was read back after migration:

- `order_items.order_id` references `orders.id` with `ON DELETE CASCADE`.
- `order_items.product_id` references `products.id` with `ON DELETE RESTRICT`.
- `orders.owner_id` references `auth.users.id` with `ON DELETE CASCADE`.
- Primary/unique indexes and indexes covering both item foreign keys and owner-ordered listing exist.
- Row-level security is enabled on all three tables.
- The authenticated browser role has neither private-schema usage nor direct order-table SELECT permission.
- The authenticated role can execute `public.ss_orders_api`; the anonymous role cannot.

The RPC derives identity from `auth.uid()` and requires the authenticated role. Its fixed statements bind typed parameters rather than concatenating SQL. `SECURITY DEFINER` uses an empty search path and schema-qualified objects. It independently revalidates payloads, so bypassing the Edge Function is not a validation bypass.

Order/item IDs are generated server-side as UUIDs. Browser-supplied ownership, IDs, prices, names and database operators are not accepted mutation fields. A catalog trigger rejects updates/deletes, keeping the server catalog fixed.

## Query-driven document model

Sources: `supabase/functions/saved-orders/mongo.mjs` and `supabase/mongo/bootstrap.mjs`.

An order document contains its UUID, verified owner, label, timestamps and up to four embedded items. Each item has its own UUID, allowlisted product ID, trusted name/price snapshot and quantity. One owner-qualified `findOne` retrieves the complete order without joining separate item or product collections.

The name/price duplication is deliberate: the principal read needs the complete small aggregate. The application copies only the trusted server catalog; it does not accept client price snapshots. There is no automatic cross-engine synchronization or historical repricing guarantee.

The array is bounded, products and item IDs are unique within it, quantities are integers from 1 to 9, and strict database validators reject invalid shapes. Indexes support unique identity and owner-scoped ordered listing. Bootstrap is a separate provisioning operation, never performed on ordinary requests.

## Atomicity and concurrency

| Operation | PostgreSQL | MongoDB |
|---|---|---|
| Read complete order | Related rows joined with the trusted product catalog | One complete embedded-order lookup |
| Change item quantity | Validated RPC updates the related item row | Owner/item-qualified `$set` with an array filter |
| Add/remove item | Validated insert/delete with foreign keys and uniqueness | Qualified atomic `$push` / `$pull` on the aggregate |
| Create/delete order | Transaction-scoped RPC; exception boundary rolls back related writes | Replica-set transaction couples order insert/delete with its owner counter |
| Ten-order limit | Existing owner row is locked before count/create | `ss_owner_caps` reserves/releases capacity in the same transaction as order insert/delete |

`ss_owner_caps` is an intentional second MongoDB collection for race-safe owner quotas, not a relational substitute for the embedded items. Item changes remain single-document atomic. Neither engine participates in a distributed transaction with the other.

## Evidence boundary

Verified: independent source reviews, the 81-check standalone unit/source suite (rerun November 14), actual schema/validator/index read-back, real SQL foreign-key/cascade/rollback tests, real MongoDB validator/transaction/concurrent-quota checks and a driver-monitored single-`find` aggregate read. These database-internal proofs remain scoped to the original [direct-storage log](qa/live-storage.log); the November 14 API run did not repeat DDL inspection or forced database faults.

Full November 14 hosted SQL + MongoDB acceptance passed 14 runner-reported tests (one parent plus 13 subtests), including actual CRUD, owner denials, Unicode/input boundaries, independently validating direct SQL RPC, concurrent quotas (12 creates admit ten and conflict twice per engine), and cross-engine dataset independence. Its cleanup reported no tracked remaining orders or unknown create outcomes. Actual integrated Chromium/Firefox cases passed CRUD, reload/read-back, item updates/deletion, owner 404 and invalid-input 400 for both engines, without API interception. See the [API log](qa/hosted-two-engine-20261114/live-api-both.log) and [browser report](qa/hosted-two-engine-20261114/integrated-live-browser.json). The earlier SQL-only acceptance remains historical, not the current hosted coverage limit.

Local Resume integration is complete and independently source-reviewed at `http://127.0.0.1:8807/showcases/stylestore-saved-orders/index.html`; it is not public deployment. Local visual approval, public release/recording and manual accessibility assessments remain separate. Independent final narrow-CSS reviews are approved; the narrow-layout finding is closed by rebuilt browser tests and actual screenshots. The [verification record](qa/report.md) retains November 12 standalone unit/browser/axe and lower Lighthouse measurements alongside the later integrated local results. No accessibility certification, public publication or academic submission is claimed.
