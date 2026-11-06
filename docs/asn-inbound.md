# ASN and inbound

Maintain Warehouse/Hub > Zone > Pallet/Bin locations in Warehouse masters. Bin names are unique within the warehouse. Product packing is entered as pieces per master carton; existing configurations retain their effective case quantity.

Use Inbound / ASN > Create ASN. Select a warehouse and invoice, fill shipment references, then add product quantities in PCS. Box counts are calculated. Saving generates master labels; product barcodes are captured at putaway.

Save good, bad and damaged master-box counts in Inbound manifest. Open Putaway carton mapping and download the CSV:

master_carton_barcode,product_barcode,condition,putaway_location

Use one row per product barcode directly inside its master. Repeat the master barcode for its pieces. Use GOOD, BAD or DAMAGE and an authorized destination bin. Store barcode cells as text in Excel. There is no inner-carton step.

Upload CSV or Excel. The app checks complete quantities, unique product barcodes, manifest quotas, warehouse access, destination compatibility and capacity. Good cartons with a destination are stored; otherwise complete their Carton putaway tasks. Exceptions are quarantined. Templates remain downloadable after completion.

Warehouse transfers reuse the master and product barcodes and create a destination ASN at ship-out. Their receiving CSV has the same four columns and prefilled product barcodes. Mobile Warehouse putaway supports both flows: scan master, scan products, choose bin, save.

Print or reprint master labels in 100 x 75 mm, 100 x 100 mm or A4. Reprinting never creates a new identity. Existing inner-carton history remains in the database but is not required by the active workflow.
