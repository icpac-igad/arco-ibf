"""
Proper tipg Vector Tile Server implementation with database initialization
"""

import os
import asyncio
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from tipg.factory import Endpoints
from tipg.settings import PostgresSettings
from tipg.middleware import CacheControlMiddleware
from tipg.errors import DEFAULT_STATUS_CODES, add_exception_handlers
from starlette.middleware.cors import CORSMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Database connection lifespan management"""
    # Startup
    try:
        from buildpg import asyncpg
        
        # Get database settings
        postgres_settings = PostgresSettings()
        
        # Convert PostgresDsn to string if needed
        database_url = str(postgres_settings.database_url)
        
        # Create connection pool
        app.state.pool = await asyncpg.create_pool_b(
            database_url,
            min_size=postgres_settings.db_min_conn_size,
            max_size=postgres_settings.db_max_conn_size,
        )
        
        print("Database connection established")
        
        # Initialize collection catalog
        async with app.state.pool.acquire() as conn:
            # Get available spatial tables
            tables_query = """
            SELECT 
                f_table_schema as schemaname,
                f_table_name as tablename,
                f_geometry_column,
                coord_dimension,
                srid,
                type
            FROM geometry_columns
            WHERE f_table_schema = 'public'
            ORDER BY f_table_schema, f_table_name;
            """
            
            tables = await conn.fetch(tables_query)
            
            # Store table information for tipg's automatic collection discovery
            table_info = []
            for table in tables:
                table_info.append({
                    'id': f"{table['schemaname']}.{table['tablename']}",
                    'schema': table['schemaname'],
                    'table': table['tablename'],
                    'geometry_column': table['f_geometry_column'],
                    'srid': table['srid'],
                    'geometry_type': table['type']
                })
            
            # Store table info for tipg to discover automatically
            app.state.table_info = table_info
            print(f"Prepared {len(table_info)} tables for tipg discovery: {[t['id'] for t in table_info]}")
            
            # Let tipg handle collection creation through its own mechanisms
            collections = {}
            
            # Set catalog in the format tipg expects
            app.state.collection_catalog = {"collections": collections}
            print(f"Initialized catalog with {len(collections)} collections: {list(collections.keys())}")
            
    except Exception as e:
        print(f"Failed to initialize database: {e}")
        app.state.pool = None
        app.state.collection_catalog = {}
    
    yield
    
    # Shutdown
    if hasattr(app.state, 'pool') and app.state.pool:
        await app.state.pool.close()
        print("Database connection closed")


# Create FastAPI app with lifespan
app = FastAPI(
    title="Vector Tile Server",
    description="OGC Features and Tiles API",
    version="1.0.0",
    lifespan=lifespan
)

# Add middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)
app.add_middleware(CacheControlMiddleware, cachecontrol="public, max-age=3600")

# Add exception handlers
add_exception_handlers(app, DEFAULT_STATUS_CODES)

# Create and include tipg endpoints
endpoints = Endpoints(
    title="Vector Tile Server",
    with_tiles_viewer=True,
    with_common=True
)
app.include_router(endpoints.router)

if __name__ == "__main__":
    # Set environment variables for tipg
    os.environ["TIPG_DB_SCHEMAS"] = "public"
    os.environ["TIPG_DB_ONLY_SPATIAL_TABLES"] = "true"
    
    # Get host and port from environment
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    
    print(f"Starting tipg Vector Tile Server on {host}:{port}")
    print(f"Database URL configured: {bool(os.getenv('DATABASE_URL'))}")
    
    # Run the tipg server
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info"
    )