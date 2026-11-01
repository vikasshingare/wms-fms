# Service360 local API contract

Base URL `http://localhost:4000/api`. JSON requests with `Authorization: Bearer <token>`. Errors `{error: string, code: string}`. All record fields use snake_case. Dates are ISO UTC strings. Status values UPPER_SNAKE_CASE; work order types `Installation`, `Service`, `Replacement`, `De-installation`, `Preventive Maintenance`, `Inspection`.

## Authentication and bootstrap

`POST /auth/login {email,password}` returns `{token,user}`. Demo users: `admin@service360.local`, `customer@service360.local`, `rahul@service360.local`; password `Service360!`. User `{id,name,email,role,customer_id,location_id}`. Roles `admin`, `customer`, `engineer`.

`GET /auth/me` returns user. `GET /bootstrap` returns `{user,stats,work_orders,assets,customers,sites,engineers,locations,products,asns,cartons,putaway_tasks,transfers,returns,activities,attendance,checklist_templates}`. Customer/engineer data is scoped. `GET /mobile/bootstrap` alias. Dashboard stats `{open_work_orders,in_progress,completed,inventory_units,my_requests,assets_at_site,pending,overdue,today_tasks,sla_compliance}`. All arrays always exist, including when empty.

## Main records

- Work order: `{id,code,type,status,priority,summary,description,customer_id,customer_name,site_id,site_name,site_code,address,city,contact_name,contact_phone,latitude,longitude,engineer_id,engineer_name,asset_id,serial,allocated_asset_id,allocated_serial,product_id,product_name,scheduled_at,due_at,created_at,completed_at,resolution,checklist,evidence,confirmation,version}`. `checklist`/`evidence` are arrays. Evidence `{id,type,name,url}`.
- Asset: `{id,serial,product_id,product_name,sku,model,status,condition,location_id,location_name,location_type,holder_user_id,site_id,customer_id,customer_name,inner_carton_id,master_carton_id,asn_id,grn_code,created_at}`.
- Site: `{id,code,name,customer_id,customer_name,address,city,region,contact_name,contact_phone,latitude,longitude,location_id}`.
- Customer: `{id,code,name,industry,contact_name,email,phone,sla_hours}`.
- Engineer: `{id,name,email,region,skills,location_id,active_jobs}`.
- Location: `{id,code,name,type,region,capacity,product_id}`; types `STAGING`, `BIN`, `HUB`, `ENGINEER`, `SITE`, `QUARANTINE`, `REPAIR`.
- Product: `{id,sku,name,model,category,serialized,units_per_inner_carton,inner_cartons_per_master}`.
- ASN: `{id,code,vendor,product_id,product_name,warehouse,expected_qty,received_qty,status,expected_date,created_at}`.
- Carton: `{id,barcode,type,parent_id,original_parent_id,product_id,product_name,asn_id,asn_code,qty,status,sealed,location_id,location_name,children,serials}`; `type` `MASTER_CARTON` / `INNER_CARTON`; children are carton records; serials array of strings.
- Putaway task: `{id,code,carton_id,barcode,handling_unit_type,product_id,product_name,expected_qty,putaway_qty,source_location_id,source_name,suggested_location_id,suggested_name,actual_location_id,status,asn_code}`.
- Transfer: `{id,code,source_location_id,source_name,destination_location_id,destination_name,status,asset_ids,serials,qty,created_at}`.
- Return: `{id,code,asset_id,serial,product_name,source_location_id,source_name,destination_location_id,destination_name,reason,condition,status,disposition,created_at}`.
- Activity: `{id,entity_type,entity_id,action,description,actor_name,created_at}`.
- Attendance: `{id,user_id,date,check_in,check_out,latitude,longitude}` or null.
- Checklist template: `{id,name,version,items:[{id,label,required}],evidence_types:["Shop front","Inside shop","Installed device"]}`.

## Work orders / engineer execution

`POST /work-orders {site_id,type,summary,description?,priority?,scheduled_at?,asset_id?,product_id?}`. Admin may supply `customer_id`; customer is inferred from site. Returns created work order.

`POST /work-orders/:id/assign {engineer_id,allocated_asset_id?}`. `POST /work-orders/:id/action {action,mobile_txn_id,...}` returns refreshed work order. Supported actions: `accept`, `en_route`, `check_in` (latitude,longitude), `start`, `pending` (reason), `complete`, `close`, `reopen`, `cancel`. Complete payload: `{serial?,old_serial?,checklist:[{id,checked:true}],evidence:[{type,name,url}],confirmation:{name,accepted:true},resolution}`. Required checklist IDs `site_verified`, `installation_tested`, `customer_briefed`; required evidence types from template. Store captured photos first with `POST /evidence {work_order_id,type,name,data}` (`data` image data URL) returning evidence record; completion uses returned IDs. Installation/replacement validates engineer possession; service/de-installation validates site asset. Completion is blocked without checklist, evidence and confirmation. `GET /work-orders/:id` returns full detail including activities. `POST /assets/validate-scan {serial,work_order_id?}` returns asset or validation error.

## WMS

`POST /asns {vendor,product_id,expected_date,master_carton_barcode,inner_cartons:[{barcode,serials:[...]}]}` creates expected hierarchy. Quantity must match product packing. `POST /asns/:id/receive {barcode,serials:[...],mobile_txn_id?}` confirms master carton receipt (all preadvised serials must match), creates GRN. `POST /cartons/:id/qc {result:"PASS"|"FAIL",reason?}` creates putaway task on pass or quarantine on fail. `POST /putaway/:id/confirm {barcode,source_location_id,destination_location_id,mobile_txn_id?}`. `POST /cartons/:id/break {child_ids:[...],serials:[...],reason}` detaches inner cartons or loose serials with history; master break uses child_ids, inner break uses serials. `GET /assets/:serial/history` returns `{asset,movements}`.

`POST /transfers {source_location_id,destination_location_id,asset_ids:[...]}` reserves loose assets; intact carton contents must first be broken. `POST /transfers/:id/dispatch {}` then `POST /transfers/:id/receive {serials:[...],mobile_txn_id?}`. Engineer can accept only transfers to their own location.

`POST /returns {asset_id,destination_location_id,reason,condition}` starts return, retaining engineer custody until receipt. `POST /returns/:id/receive {}` admin confirms receipt. `POST /returns/:id/disposition {disposition:"AVAILABLE"|"REPAIR"|"REFURBISHED"|"SCRAP",reason}` records repair/QC outcome and movements.

## Masters, attendance, reporting

`POST /customers {name,industry,contact_name,email,phone,sla_hours}`; `POST /sites {customer_id,name,address,city,region,contact_name,contact_phone,latitude?,longitude?}`; `POST /products {sku,name,model,category,units_per_inner_carton,inner_cartons_per_master}`; `POST /locations {code,name,type,region,capacity,product_id?}` (admin only).

`POST /attendance {action:"check_in"|"check_out",latitude?,longitude?,mobile_txn_id?}`. `POST /mobile/sync {events:[{mobile_txn_id,work_order_id,action,payload}...]}` returns per-event `{mobile_txn_id,status,result?,error?}`. `GET /reports` returns `{stats,by_type,by_status,inventory_by_location,engineer_performance}`. All GET collection URLs above return their array. `GET /health` does not require login.
