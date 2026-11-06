# Authentication and authorization

The versioned endpoints are POST `/api/v1/auth/login`, POST `/api/v1/auth/refresh`, POST `/api/v1/auth/logout` and GET `/api/v1/auth/me`. Existing `/api` clients remain supported.

Login accepts email/password and returns `access_token` (`token` remains a compatibility alias), `refresh_token`, `expires_in` and a canonical user role. Access JWTs expire after 15 minutes. Refresh secrets expire after 30 days and are stored only as SHA-256 hashes. Refresh rotates the token atomically. Reusing a rotated token revokes the session family. Logout revokes the family and immediately invalidates its access tokens. Each request verifies the live session and reloads the user so role changes take effect immediately. Passwords use bcrypt.

Supported roles are SUPER_ADMIN, SYSTEM_ADMIN, HO_OPERATIONS, WAREHOUSE_MANAGER, WAREHOUSE_OPERATOR, REGIONAL_MANAGER, COORDINATOR, REGIONAL_STOCK_MANAGER, FIELD_ENGINEER, CUSTOMER_ADMIN, CUSTOMER_USER, AUDITOR and REPAIR_TECHNICIAN. Existing admin/engineer/customer records are mapped to SYSTEM_ADMIN/FIELD_ENGINEER/CUSTOMER_USER without changing their passwords.

`server/src/authorization.js` contains the permission policy and middleware. Auditors are read-only. Engineers receive assigned work orders, their stock and associated site/customer data. Customer access is restricted to its organization. Regional roles use their assigned region; warehouse roles use explicit location scopes or their single assigned location. Missing scope grants yield no records. Reports calculate metrics after filtering. Direct record reads and warehouse commands also validate scope.

Administrators can open **Management → Users & permissions** to create accounts and edit roles and customer/region/location assignments. Only a Super Admin can grant or edit Super Admin access. Role/password changes revoke the affected user's sessions. The activity view includes authentication events; failed logins can be audited even when the email does not identify an account.

Apply `node src/migrate-auth.js` from `server` before starting the updated API against an existing database. This additive migration creates auth sessions, security audit and location-scope tables. Back up your database as part of normal deployment. Old JWTs must sign in again after migration.

Run the isolated integration suite in PowerShell:

```powershell
$env:TEST_SCRIPT='tests/auth-rbac.mjs'
npm test
```

The test runner creates and removes its own MySQL database and does not modify the demo or deployed database.
