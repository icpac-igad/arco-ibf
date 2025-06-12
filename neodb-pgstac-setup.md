# Complete Guide: Setting up pypgstac on Neon Database

## Overview

Setting up pypgstac on Neon Database (a managed PostgreSQL service) requires special consideration due to permission restrictions inherent in managed database environments. This guide documents the complete process, including common pitfalls and their solutions.

## The Challenge

Neon Database, like other managed PostgreSQL services, implements security restrictions that differ from self-hosted PostgreSQL installations:

1. **No superuser access**: You cannot use the `postgres` superuser
2. **Limited role management**: Cannot grant certain system roles like `pg_database_owner`
3. **Schema ownership restrictions**: The `public` schema is owned by `pg_database_owner`, which cannot have explicit members
4. **Role switching limitations**: The pypgstac migration process needs to switch between roles, which requires specific permissions

## What Didn't Work

### 1. Attempting to Use the postgres User
```sql
CREATE ROLE postgres;  -- This role already exists
ALTER DATABASE neondb OWNER TO postgres;  -- Error: must be able to SET ROLE "postgres"
```
**Why it failed**: Neon doesn't allow you to use or impersonate the `postgres` superuser role.

### 2. Trying to Grant pg_database_owner
```sql
GRANT pg_database_owner TO neondb_owner;  -- Error: role "pg_database_owner" cannot have explicit members
```
**Why it failed**: This is a special system role in managed PostgreSQL that cannot have explicit members.

### 3. Using the Public Schema Directly
```sql
GRANT ALL ON SCHEMA public TO neondb_owner;  -- Appears to work but...
-- Migration still fails with: permission denied for schema public
```
**Why it failed**: Even with GRANT statements, the `public` schema is owned by `pg_database_owner`, and pypgstac cannot create objects there due to ownership restrictions.

## The Working Solution

The key insight is to **create a dedicated schema** that your user fully owns, bypassing the restrictions on the `public` schema.

### Step 1: Connect to Your Neon Database
```bash
psql "postgresql://neondb_owner:your_password@your-project.region.aws.neon.tech/neondb?sslmode=require"
```

### Step 2: Create Required Roles
```sql
-- Create the STAC-specific roles that pypgstac expects
CREATE ROLE pgstac_read;
CREATE ROLE pgstac_ingest;
CREATE ROLE pgstac_admin;

-- Grant these roles to your Neon user
GRANT pgstac_read TO neondb_owner;
GRANT pgstac_ingest TO neondb_owner;
GRANT pgstac_admin TO neondb_owner;
```

### Step 3: Create a Dedicated Schema
```sql
-- Create a schema that you own (this is the crucial step!)
CREATE SCHEMA pgstac AUTHORIZATION neondb_owner;

-- Grant appropriate permissions on this schema
GRANT ALL ON SCHEMA pgstac TO neondb_owner;
GRANT ALL ON SCHEMA pgstac TO pgstac_admin;
GRANT CREATE, USAGE ON SCHEMA pgstac TO pgstac_ingest;
GRANT USAGE ON SCHEMA pgstac TO pgstac_read;
```

### Step 4: Configure Search Path
```sql
-- Set the search path so pypgstac finds the schema
ALTER DATABASE neondb SET search_path TO pgstac, public;
ALTER USER neondb_owner SET search_path TO pgstac, public;
```

### Step 5: Set Default Privileges
```sql
-- Ensure future objects created in the schema have proper permissions
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA pgstac 
    GRANT ALL ON TABLES TO pgstac_admin, pgstac_ingest;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA pgstac 
    GRANT ALL ON SEQUENCES TO pgstac_admin, pgstac_ingest;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA pgstac 
    GRANT ALL ON FUNCTIONS TO pgstac_admin, pgstac_ingest;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA pgstac 
    GRANT SELECT ON TABLES TO pgstac_read;
```

### Step 6: Install Required Extensions
```sql
-- PostGIS and btree_gist are required by pgstac
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

### Step 7: Grant Permissions for Extensions
```sql
-- Ensure access to public schema for PostGIS functions
GRANT USAGE ON SCHEMA public TO neondb_owner;
GRANT USAGE ON SCHEMA public TO pgstac_admin;
GRANT USAGE ON SCHEMA public TO pgstac_ingest;
GRANT USAGE ON SCHEMA public TO pgstac_read;
```

### Step 8: Run the Migration
```bash
pypgstac migrate --dsn "postgresql://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE?sslmode=require"
```

## Handling Migration Errors

### If You Get "relation already exists" Errors

This means a previous migration attempt partially succeeded. Clean up and start fresh:

```sql
-- Remove the existing schema and all its contents
DROP SCHEMA IF EXISTS pgstac CASCADE;

-- Then repeat steps 3-7 above
```

### Complete Reset Script

If you need to completely reset and start over:

```sql
-- Drop everything related to pgstac
DROP SCHEMA IF EXISTS pgstac CASCADE;
DROP ROLE IF EXISTS pgstac_read;
DROP ROLE IF EXISTS pgstac_ingest;
DROP ROLE IF EXISTS pgstac_admin;

-- Then run all the setup steps from the beginning
```

## Key Insights

1. **Schema Ownership is Critical**: In managed PostgreSQL services, you need a schema that you own completely. The `public` schema often has restrictions.

2. **Role Hierarchy Matters**: pypgstac uses multiple roles for security separation. All these roles must be created and properly granted to your main user.

3. **Search Path Configuration**: PostgreSQL needs to know where to look for pgstac objects. Setting the search path ensures the migration finds the right schema.

4. **SSL is Required**: Neon requires SSL connections. Always include `?sslmode=require` in your connection string.

## Verification

After successful migration, verify the installation:

```bash
# Check the installed version
pypgstac version --dsn "postgresql://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE?sslmode=require"
```

```sql
-- Check created tables
SELECT schemaname, tablename 
FROM pg_tables 
WHERE schemaname = 'pgstac'
ORDER BY tablename;

-- Should show tables like:
-- collections
-- items
-- migrations
-- pgstac_settings
-- ... and others
```

## Best Practices for Neon

1. **Always use environment variables** for credentials
2. **Include sslmode=require** in all connection strings
3. **Use the dedicated pgstac schema** instead of public
4. **Document your role structure** for team members
5. **Test migrations in a development branch** before production

## Conclusion

The key to successfully running pypgstac migrations on Neon Database is understanding and working within the constraints of managed PostgreSQL services. By creating a dedicated schema that you fully control, you bypass the permission issues that would otherwise block the migration. This approach should work for other managed PostgreSQL services with similar restrictions.