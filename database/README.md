# MySQL database

`service360.sql` contains the complete application schema and clean demonstration data generated from `server/src/setup.js`. It does not contain local database credentials, JWT signing secrets, or changes made in the running application.

Import into MySQL 8.4 using MySQL Workbench, phpMyAdmin, or the MySQL command line:

```sql
SOURCE C:/path/to/wms-fms/database/service360.sql;
```

The file creates and selects the `service360` database. Import only into a new or disposable database: the export replaces the application tables in that database.

After import, run `npm run setup` from the project root to install dependencies and provision the local application database account and configuration. Setup preserves the imported seed records. Alternatively, configure `server/.env` from `server/.env.example` with your own database account and a random JWT secret.

Demo accounts use `Service360!`:

- `admin@service360.local`
- `customer@service360.local`
- `rahul@service360.local`
- `priya@service360.local`

Passwords in the SQL file are bcrypt hashes of the public demo password. Use your own credentials and account policy before production deployment.
