# Product-barcode receiving and transfers

The active inventory hierarchy is master carton > product_barcode. Inner cartons are not entered, created, scanned or validated by the current receiving workflow. Historical inner references remain in the database for traceability.

## New stock

1. Configure pieces per master carton in the product/packing master.
2. Create an ASN with quantities in pieces. Saving generates master labels.
3. Save good/bad/damaged master-box counts in Inbound manifest.
4. Download the putaway CSV. Use one row per piece:

   master_carton_barcode,product_barcode,condition,putaway_location

5. Enter actual product barcodes directly under their master. Use GOOD, BAD or DAMAGE and one condition/location per master. The piece count must match exactly.
6. Upload CSV or Excel. Good stock is put away when a bin is supplied; otherwise finish its Carton putaway task. Bad/damaged stock is quarantined.

## Warehouse transfer

1. Create a warehouse transfer and generate its FIFO pick list. Inter-warehouse moves require complete intact master cartons.
2. Confirm the picked product barcodes, then record Gate ship-out details.
3. Ship-out creates the destination ASN and snapshots existing master-to-product mappings. It creates no new carton identities.
4. Destination staff save master-box condition counts and download the same four-column CSV. Product barcodes are prefilled from the shipment.
5. Fill putaway_location and upload. Good stock becomes AVAILABLE and exceptions are quarantined. The transfer completes when every carton is received.

Warehouse putaway in the mobile app uses: scan master > scan each product > select bin > save. It supports both new stock and incoming warehouse transfers. The scoped /inbound/putaway-options endpoint lists their pending masters. The app can send destination_location_id rather than a bin code on each row; all transfer conditions require a destination.

The portal and app use the same /inbound/asns/:id/entry/putaway-mapping endpoint. Exact retries do not duplicate stock. Master labels can be reprinted using their original identity. Existing shipment and movement history is preserved.

Run npm run test:inbound for product-only receiving, quantities, conditions, mobile-shaped submissions, warehouse scopes, duplicate protection and round-trip transfers. Run npm test for core inventory and historical flows; run mobile typecheck and lint before release.
