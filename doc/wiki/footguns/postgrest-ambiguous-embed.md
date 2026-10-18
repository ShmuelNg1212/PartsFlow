# A second foreign key breaks an existing PostgREST embed

`document_lines` has two foreign keys to `products`: `product_id` and `suggested_product_id` (T6.1).
With two keys, `product:products(...)` fails with "more than one relationship was found". The document page then does not load.

- Name the key in the embed: `product:products!document_lines_product_id_shop_id_fkey(...)`.
- Before you add a foreign key, search the client for embeds between the two tables (`grep -rn "products(" src`).
- The database suite does not catch this. Only a request through PostgREST does (an E2E test that opens a document).
