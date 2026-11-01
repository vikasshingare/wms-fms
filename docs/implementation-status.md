# Implementation scope

This is a runnable local implementation of the central Service360 workflows. The supplied specification describes a multi-phase enterprise platform. Local execution and the workflows below do not constitute production acceptance of every requirement in that specification.

| Area | Local implementation |
| --- | --- |
| Applications | Admin and customer React web portals; Expo / React Native field engineer app |
| Identity | Password login, hashed passwords, signed bearer tokens, three scoped application roles |
| Customers and sites | Customer and site records, contact details, site inventory and service requests |
| Work orders | Create, assign, controlled execution actions, evidence/checklist/customer acceptance and closure |
| Serialized inventory | One current location/holder per asset, explicit movements and asset history |
| Cartons | Product packing configuration, master and inner hierarchy, pre-advised serial validation, receipt, QC, putaway and carton break |
| Transfers | Reservation, dispatch and recipient acceptance; intact contents require break before loose transfer |
| Reverse logistics | Engineer return, receiving confirmation and repair/refurbish/scrap disposition |
| Mobile | Tasks, attendance, stock, scans/manual entry, photo evidence, event location and persistent sync outbox |
| Reporting | Operational statistics, work order types/statuses, inventory location and engineer summaries |

The following enterprise requirements need further implementation or integration before production rollout:

- SSO, configurable MFA, refresh-token rotation, remote device revocation, granular region/warehouse permissions, encryption-at-rest policy and external security review.
- Customer-specific versioned workflow/checklist configuration, contract calendars, advanced SLA escalation and scheduled preventive-maintenance generation.
- Non-serialized quantity/consumable accounting, capacity by weight and dimensions, advanced location mixing/ownership rules, pick waves, full-carton outbound dispatch, cycle counts, approved adjustments and a complete repack workflow.
- Multi-stage repair jobs with labor/parts/QC records, estimates, vendor RMA, and approval policies for scrap and inventory adjustments.
- ERP/procurement imports, email/SMS/push integrations, real OTP delivery, customer handwritten signatures, controlled evidence retention and object storage. The local app uses customer declaration and MySQL-backed evidence.
- Independent regional-operations permission profiles and organization management beyond the seeded administrator, customer and engineer roles.
- Full geofence enforcement, device-level background sync, conflict reconciliation across all workflow types, device signing, physical Android/iOS UAT, load testing, backups and production deployment.

The current audit trail is append-only through the exposed application APIs; a privileged database administrator can still change database records. It is not a tamper-evident external audit system.
