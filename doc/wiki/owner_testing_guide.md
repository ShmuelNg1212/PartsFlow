# Owner testing guide

Use the demo shop or the E2E test shop first. Do not enter real invoices in the development project.
The demo label must stay visible when the demo shop is selected.

## First stock flow

1. Sign in as the owner.
2. Open Inventory.
3. Create a product with a unique SKU, part number, brand, and base unit `pc`.
4. Set its opening quantity to `0`.
5. Open Invoices.
6. Create a document with direction **Receive stock**.
7. Choose **Enter the lines by hand**.
8. Enter one line with invoice quantity `5` and received quantity `5`.
9. Select the product.
10. Save the draft.
11. Check Inventory. Stock must still be `0`.
12. Open the draft.
13. Select **Review and post**.
14. Check that the summary shows `+5 pc`.
15. Confirm the post.
16. Create a sale of `2` for the same product.
17. Review and post the sale.
18. Check Inventory. Stock must be `3`.
19. Open the product. Both movements must link to their source documents.

## Role and connection checks

Sign in as staff in a second browser session.
Create and save a sale draft there. Staff must have no post control.
Open the draft as owner and post it.
The staff session must show the new balance without a full reload.
Try a sale greater than the quantity on hand. Posting must fail with a stock message.

Disconnect the network while editing a draft.
Check the connection banner. Restore the connection before saving.
Reload an unsaved draft. Check the local restore prompt.

## Corrections and extraction

Reverse the sale with a reason. Stock must return to `5`.
Check that the original sale stays read only.
Upload a bundled sample from `public/samples/` to a new receipt.
Check the **Demo extractor** label and uncertain-field marks.
Check the original beside the fields on desktop and above them on phone.
Confirm each product and received quantity. A sample must not post automatically.
Try an unrelated image without Azure credentials. Manual entry must remain available.

For the new development Azure test, first complete the setup in [setup](setup.md#extraction-evaluation).
Use the newly generated files outside the checkout. These are not canned demo results.
Upload one synthetic PDF or JPEG. Check that the provider is Azure before you call it an actual read.
Compare every field with the original and the reference answers. Correct errors before posting.
Check the supplier for receipts and the customer for sales. Check brand and discounts by hand.
Save the draft. Check that stock has not changed. Then select products and received quantities.
Post once. Check Inventory and Overview. Reopen the document and check its stock movement.
Try the three-page PDF. Automatic reading must stop and leave manual entry available.
Repeat with an unsupported photo format and a poor image. Check the explanation and correction path.
Record failures and missing or extra lines. Synthetic tests do not prove real-shop accuracy.

## Phone and pilot record

Repeat the first stock flow on a real phone.
Check the keyboard, rotation, safe areas, scrolling, and bottom actions.
Use enlarged text. Check long part numbers and quantities.
Emulated phone tests do not prove these hardware behaviors.

In Settings, export **Pilot measurements** as owner.
Record completion time, corrections, match errors, and whether help was needed.
Use observed results only. Azure accuracy and real-shop pilot results are not yet measured.
