# Database Setup: Neon PostgreSQL with pgSTAC

## Overview

This document details the complete database setup process using Neon's managed PostgreSQL service with pgSTAC extensions for STAC data storage and querying.

## Background: Why External Database

### Initial Challenge
- **Replit PostgreSQL Conflicts**: System dependency conflicts between GDAL installation and PostgreSQL setup
- **Resource Constraints**: Limited system resources for both computational and database services
- **Maintenance Overhead**: Database administration complexity in development environment

### Solution: Neon Database
- **Managed Service**: Fully managed PostgreSQL with built-in optimizations
- **PostGIS Support**: Native geospatial extensions
- **Scalability**: Automatic scaling and connection pooling
- **Separation of Concerns**: Database service independent of application hosting

## Neon Database Configuration

### 1. Database Creation

#### Account Setup
```bash
# Create account at https://neon.tech
# Select region closest to Replit servers (US-East recommended)
# Choose PostgreSQL 15+ for full PostGIS compatibility
```

#### Initial Configuration
```sql
-- Database created automatically with Neon project
-- Default database name: neondb
-- Automatic user creation with admin privileges
```

### 2. Extension Installation

#### PostGIS Setup
```sql
-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS postgis_tiger_geocoder;

-- Verify PostGIS installation
SELECT PostGIS_Version();
```

#### pgSTAC Installation
```sql
-- Install pgSTAC extension
CREATE EXTENSION IF NOT EXISTS pgstac;

-- Verify pgSTAC installation
SELECT pgstac_version();

-- Check pgSTAC schema
\dt pgstac.*
```

### 3. Database Schema Setup

#### pgSTAC Schema Structure
```sql
-- pgSTAC creates the following main tables:
-- pgstac.collections - STAC collection metadata
-- pgstac.items - STAC item records
-- pgstac.assets - Asset information
-- pgstac.searches - Saved search queries

-- Verify schema creation
SELECT schemaname, tablename 
FROM pg_tables 
WHERE schemaname = 'pgstac';
```

#### Custom Extensions
```sql
-- Additional indexes for performance
CREATE INDEX IF NOT EXISTS items_geometry_idx 
ON pgstac.items USING GIST (geometry);

CREATE INDEX IF NOT EXISTS items_datetime_idx 
ON pgstac.items (datetime);

CREATE INDEX IF NOT EXISTS items_collection_idx 
ON pgstac.items (collection);
```

## Connection Configuration

### Environment Variables Setup

#### Database Connection Parameters
```bash
# Primary connection string
DATABASE_URL="postgresql://username:password@ep-cool-grass-123456.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Individual parameters for flexibility
PGHOST="ep-cool-grass-123456.us-east-2.aws.neon.tech"
PGPORT="5432"
PGDATABASE="neondb"
PGUSER="username"
PGPASSWORD="password"
PGSSLMODE="require"
```

#### Connection Pool Configuration
```python
# Database connection settings for optimal performance
DATABASE_CONFIG = {
    "pool_size": 10,
    "max_overflow": 20,
    "pool_pre_ping": True,
    "pool_recycle": 3600,
    "connect_args": {
        "sslmode": "require",
        "connect_timeout": 10,
        "server_settings": {
            "application_name": "titiler-pgstac-replit",
        }
    }
}
```

### Connection Implementation

#### Basic Connection Test
```python
import psycopg
import os

def test_database_connection():
    """Test basic database connectivity."""
    try:
        conn_string = os.environ.get("DATABASE_URL")
        with psycopg.connect(conn_string) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT version();")
                version = cur.fetchone()[0]
                print(f"✓ PostgreSQL Version: {version}")
                
                cur.execute("SELECT PostGIS_Version();")
                postgis = cur.fetchone()[0]
                print(f"✓ PostGIS Version: {postgis}")
                
                cur.execute("SELECT pgstac_version();")
                pgstac = cur.fetchone()[0]
                print(f"✓ pgSTAC Version: {pgstac}")
                
        return True
    except Exception as e:
        print(f"✗ Database connection failed: {e}")
        return False
```

#### Connection Pool Implementation
```python
import psycopg_pool
from contextlib import asynccontextmanager

class DatabaseManager:
    def __init__(self):
        self.pool = None
    
    async def initialize(self):
        """Initialize connection pool."""
        conn_string = os.environ.get("DATABASE_URL")
        self.pool = psycopg_pool.AsyncConnectionPool(
            conninfo=conn_string,
            min_size=2,
            max_size=10,
            kwargs={
                "autocommit": True,
                "row_factory": psycopg.rows.dict_row
            }
        )
        await self.pool.wait()
    
    @asynccontextmanager
    async def get_connection(self):
        """Get connection from pool."""
        async with self.pool.connection() as conn:
            yield conn
    
    async def close(self):
        """Close connection pool."""
        if self.pool:
            await self.pool.close()

# Global database manager instance
db_manager = DatabaseManager()
```

## Data Loading Process

### 1. STAC Collection Setup

#### Sample Collection Creation
```python
async def create_sample_collection():
    """Create a sample STAC collection."""
    collection_data = {
        "id": "noaa-gefs-forecast",
        "type": "Collection",
        "title": "NOAA GEFS Forecast Data",
        "description": "Global Ensemble Forecast System weather data",
        "extent": {
            "spatial": {
                "bbox": [[-180, -90, 180, 90]]
            },
            "temporal": {
                "interval": [["2020-01-01T00:00:00Z", None]]
            }
        },
        "license": "public-domain",
        "providers": [
            {
                "name": "NOAA",
                "roles": ["producer"],
                "url": "https://www.ncei.noaa.gov/data/global-ensemble-forecast-system/"
            }
        ]
    }
    
    async with db_manager.get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM pgstac.create_collection(%s)",
                (json.dumps(collection_data),)
            )
```

### 2. STAC Item Ingestion

#### Batch Item Loading
```python
async def load_stac_items(items_data):
    """Load multiple STAC items efficiently."""
    async with db_manager.get_connection() as conn:
        async with conn.cursor() as cur:
            # Use pgSTAC's bulk insert function
            for item in items_data:
                await cur.execute(
                    "SELECT * FROM pgstac.create_item(%s)",
                    (json.dumps(item),)
                )
```

### 3. Performance Optimization

#### Indexing Strategy
```sql
-- Spatial indexing for geometry queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS items_geom_gist_idx 
ON pgstac.items USING GIST (geometry);

-- Temporal indexing for time-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS items_datetime_btree_idx 
ON pgstac.items USING BTREE (datetime);

-- Collection-based indexing
CREATE INDEX CONCURRENTLY IF NOT EXISTS items_collection_btree_idx 
ON pgstac.items USING BTREE (collection);

-- Properties indexing for metadata queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS items_properties_gin_idx 
ON pgstac.items USING GIN (properties);
```

#### Query Optimization
```sql
-- Analyze tables for query planning
ANALYZE pgstac.collections;
ANALYZE pgstac.items;

-- Update table statistics
UPDATE pg_stat_user_tables 
SET n_tup_ins = n_tup_ins + 0 
WHERE schemaname = 'pgstac';
```

## Integration with TiTiler

### Database Configuration in TiTiler

#### Settings Configuration
```python
from titiler.pgstac.settings import PostgresSettings

# Database settings for TiTiler-pgSTAC
postgres_settings = PostgresSettings(
    postgres_user=os.environ.get("PGUSER"),
    postgres_pass=os.environ.get("PGPASSWORD"),
    postgres_host=os.environ.get("PGHOST"),
    postgres_port=int(os.environ.get("PGPORT", 5432)),
    postgres_dbname=os.environ.get("PGDATABASE"),
    postgres_application_name="titiler-pgstac"
)
```

#### Connection Pool Integration
```python
from titiler.pgstac.db import connect_to_db

async def setup_database():
    """Setup database connection for TiTiler."""
    return await connect_to_db(
        user=postgres_settings.postgres_user,
        password=postgres_settings.postgres_pass,
        host=postgres_settings.postgres_host,
        port=postgres_settings.postgres_port,
        database=postgres_settings.postgres_dbname,
        application_name=postgres_settings.postgres_application_name
    )
```

## Monitoring and Maintenance

### Health Checks

#### Database Health Monitoring
```python
async def check_database_health():
    """Comprehensive database health check."""
    health_status = {
        "database": "unknown",
        "postgis": "unknown", 
        "pgstac": "unknown",
        "connections": 0,
        "collections": 0,
        "items": 0
    }
    
    try:
        async with db_manager.get_connection() as conn:
            async with conn.cursor() as cur:
                # Basic connectivity
                await cur.execute("SELECT 1")
                health_status["database"] = "healthy"
                
                # PostGIS status
                await cur.execute("SELECT PostGIS_Version()")
                health_status["postgis"] = "healthy"
                
                # pgSTAC status
                await cur.execute("SELECT pgstac_version()")
                health_status["pgstac"] = "healthy"
                
                # Connection count
                await cur.execute("""
                    SELECT COUNT(*) FROM pg_stat_activity 
                    WHERE application_name LIKE 'titiler%'
                """)
                health_status["connections"] = (await cur.fetchone())[0]
                
                # Data counts
                await cur.execute("SELECT COUNT(*) FROM pgstac.collections")
                health_status["collections"] = (await cur.fetchone())[0]
                
                await cur.execute("SELECT COUNT(*) FROM pgstac.items")
                health_status["items"] = (await cur.fetchone())[0]
                
    except Exception as e:
        health_status["error"] = str(e)
    
    return health_status
```

### Performance Monitoring

#### Query Performance Tracking
```sql
-- Enable query statistics
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Monitor slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements 
WHERE query LIKE '%pgstac%'
ORDER BY mean_time DESC 
LIMIT 10;
```

#### Connection Monitoring
```sql
-- Active connections
SELECT application_name, count(*) 
FROM pg_stat_activity 
GROUP BY application_name;

-- Long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
FROM pg_stat_activity 
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';
```

## Backup and Recovery

### Automated Backups
```bash
# Neon provides automatic backups
# Point-in-time recovery available
# Manual backup creation via Neon console
```

### Data Export
```python
async def export_stac_data():
    """Export STAC data for backup."""
    async with db_manager.get_connection() as conn:
        async with conn.cursor() as cur:
            # Export collections
            await cur.execute("SELECT * FROM pgstac.all_collections()")
            collections = await cur.fetchall()
            
            # Export items (paginated for large datasets)
            items = []
            limit = 1000
            offset = 0
            
            while True:
                await cur.execute("""
                    SELECT * FROM pgstac.get_items('{}', %s, %s)
                """, (limit, offset))
                batch = await cur.fetchall()
                if not batch:
                    break
                items.extend(batch)
                offset += limit
            
            return {
                "collections": collections,
                "items": items
            }
```

## Troubleshooting

### Common Issues

#### 1. Connection Timeouts
```python
# Solution: Increase connection timeout
connect_args = {
    "connect_timeout": 30,
    "keepalives_idle": 600,
    "keepalives_interval": 30,
    "keepalives_count": 3
}
```

#### 2. SSL Certificate Issues
```python
# Solution: Verify SSL mode
conn_string = conn_string.replace("sslmode=require", "sslmode=prefer")
```

#### 3. Pool Exhaustion
```python
# Solution: Optimize connection pool settings
pool_settings = {
    "min_size": 5,
    "max_size": 20,
    "max_idle": 300,  # 5 minutes
    "max_lifetime": 3600  # 1 hour
}
```

### Diagnostic Queries

#### Connection Diagnostics
```sql
-- Current connections
SELECT * FROM pg_stat_activity WHERE application_name LIKE 'titiler%';

-- Database size
SELECT pg_size_pretty(pg_database_size('neondb'));

-- Table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables WHERE schemaname = 'pgstac';
```

This external database setup provides a robust, scalable foundation for TiTiler-pgSTAC operations while maintaining separation from the computational environment on Replit.