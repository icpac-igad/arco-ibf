"""TiTiler+PgSTAC FastAPI application with Replit fixes and Xarray support."""

import logging
import os
from contextlib import asynccontextmanager
from typing import Dict, Literal, Optional

import jinja2
import rasterio
from fastapi import FastAPI, Path, Query
from psycopg import OperationalError
from psycopg.rows import dict_row
from psycopg_pool import PoolTimeout
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.templating import Jinja2Templates
from typing_extensions import Annotated

from titiler.core import __version__ as titiler_version
from titiler.core.errors import DEFAULT_STATUS_CODES, add_exception_handlers
from titiler.core.factory import (
    AlgorithmFactory,
    ColorMapFactory,
    MultiBaseTilerFactory,
    TilerFactory,
    TMSFactory,
)
from titiler.core.middleware import (
    CacheControlMiddleware,
    LoggerMiddleware,
    TotalTimeMiddleware,
)
from titiler.core.models.OGC import Conformance, Landing
from titiler.core.resources.enums import MediaType, OptionalHeader
from titiler.core.templating import create_html_response
from titiler.core.utils import accept_media_type, update_openapi
from titiler.mosaic.errors import MOSAIC_STATUS_CODES
from titiler.pgstac import __version__ as titiler_pgstac_version
from titiler.pgstac.db import close_db_connection, connect_to_db
from psycopg_pool import ConnectionPool
from titiler.pgstac.dependencies import (
    AssetIdParams,
    CollectionIdParams,
    ItemIdParams,
    SearchIdParams,
)
from titiler.pgstac.errors import PGSTAC_STATUS_CODES
from titiler.pgstac.extensions import searchInfoExtension
from titiler.pgstac.factory import (
    MosaicTilerFactory,
    add_search_list_route,
    add_search_register_route,
)
from titiler.pgstac.reader import PgSTACReader
from titiler.pgstac.settings import ApiSettings

# Import xarray components
try:
    from titiler.xarray import __version__ as titiler_xarray_version
    from titiler.xarray.factory import TilerFactory as XarrayTilerFactory
    from titiler.xarray.extensions import VariablesExtension
    from titiler.xarray.io import Reader as XarrayReader
    import xarray
    XARRAY_AVAILABLE = True
    print("[REPLIT DEBUG] TiTiler-Xarray modules loaded successfully")

    # Check for optional dependencies
    try:
        import zarr
        import h5netcdf
        import fsspec
        XARRAY_FULL = True
        print(
            "[REPLIT DEBUG] Xarray full dependencies available (zarr, h5netcdf, fsspec)"
        )
    except ImportError:
        XARRAY_FULL = False
        print("[REPLIT DEBUG] Xarray minimal dependencies not available")
        print(
            "[REPLIT DEBUG] Install with: pip install 'titiler.xarray[minimal]'"
        )

except ImportError as e:
    XARRAY_AVAILABLE = False
    XARRAY_FULL = False
    print(f"[REPLIT DEBUG] TiTiler-Xarray not available: {e}")
    print("[REPLIT DEBUG] Install with: pip install 'titiler.xarray[minimal]'")

logging.getLogger("botocore.credentials").disabled = True
logging.getLogger("botocore.utils").disabled = True
logging.getLogger("rio-tiler").setLevel(logging.ERROR)

# Add debug logging for Replit
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # This should output to Replit console
    ])
logger = logging.getLogger(__name__)

# Also use print statements for Replit debugging
print("=== TiTiler-PgSTAC Starting ===")
print(f"Python logging level: {logging.getLogger().getEffectiveLevel()}")
print(f"Xarray support available: {XARRAY_AVAILABLE}")
print(f"Xarray full dependencies: {XARRAY_FULL}")
print("===============================")

package_name = __package__ or "titiler.pgstac"
jinja2_env = jinja2.Environment(loader=jinja2.ChoiceLoader([
    jinja2.PackageLoader(package_name, "templates"),
    jinja2.PackageLoader("titiler.core.templating", "html"),
]))
templates = Jinja2Templates(env=jinja2_env)

settings = ApiSettings()

# REPLIT FIX: The ApiSettings should automatically read TITILER_API_ROOT_PATH
# but let's add logging to confirm what it's using
print(
    f"[REPLIT DEBUG] TiTiler root_path from settings: '{settings.root_path}'")
print(
    f"[REPLIT DEBUG] TITILER_API_ROOT_PATH env var: '{os.environ.get('TITILER_API_ROOT_PATH', 'NOT SET')}'"
)
logger.info(f"TiTiler root_path from settings: '{settings.root_path}'")
logger.info(
    f"TITILER_API_ROOT_PATH env var: '{os.environ.get('TITILER_API_ROOT_PATH', 'NOT SET')}'"
)

# Additional override if needed
if not settings.root_path and 'TITILER_API_ROOT_PATH' not in os.environ:
    # Fallback for Replit - empty root path
    settings.root_path = ""
    print("[REPLIT DEBUG] Using fallback empty root_path for Replit")
    logger.info("Using fallback empty root_path for Replit")


def create_replit_db_pool():
    """Create a database connection pool optimized for Replit."""

    # Replit-optimized connection parameters
    params = {
        'host': os.environ.get('PGHOST', 'localhost'),
        'database': os.environ.get('PGDATABASE', 'postgres'),
        'user': os.environ.get('PGUSER', 'postgres'),
        'password': os.environ.get('PGPASSWORD', ''),
        'port': os.environ.get('PGPORT', '5432'),
        'application_name': 'titiler-pgstac-replit',
        'connect_timeout': '10',
    }

    # Clean connection string without invalid parameters
    conn_string = (f"postgresql://{params['user']}:{params['password']}"
                   f"@{params['host']}:{params['port']}/{params['database']}"
                   f"?application_name={params['application_name']}"
                   f"&connect_timeout={params['connect_timeout']}")

    print(
        f"[REPLIT DEBUG] Creating DB pool with connection string (password hidden)"
    )
    print(
        f"[REPLIT DEBUG] Host: {params['host']}, Database: {params['database']}, User: {params['user']}"
    )
    logger.info(f"Creating DB pool with connection string (password hidden)")
    logger.info(
        f"Host: {params['host']}, Database: {params['database']}, User: {params['user']}"
    )

    # Use TiTiler environment variables for pool configuration
    min_size = int(os.environ.get('DB_MIN_CONN_SIZE', '0'))
    max_size = int(os.environ.get('DB_MAX_CONN_SIZE', '2'))
    max_queries = int(os.environ.get('DB_MAX_QUERIES', '50'))
    max_idle = int(os.environ.get('DB_MAX_IDLE', '300'))

    print(
        f"[REPLIT DEBUG] Pool config - min: {min_size}, max: {max_size}, max_queries: {max_queries}, max_idle: {max_idle}"
    )

    # Create pool with TiTiler-compatible settings
    return ConnectionPool(
        conn_string,
        min_size=min_size,
        max_size=max_size,
        timeout=5,  # Connection acquisition timeout
        max_idle=max_idle,  # Max idle time in seconds
        max_lifetime=1800,  # 30 minutes max lifetime
        num_workers=3,  # Background workers for connection management
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI Lifespan with TiTiler's built-in database connection."""
    try:
        # Use TiTiler's built-in database connection system
        print("[REPLIT DEBUG] Using TiTiler's built-in database connection...")
        logger.info("Using TiTiler's built-in database connection...")

        await connect_to_db(app)

        # Test the connection
        if hasattr(app.state, 'dbpool') and app.state.dbpool is not None:
            print("[REPLIT DEBUG] Testing database connection...")
            with app.state.dbpool.connection(timeout=5) as conn:
                conn.execute("SELECT 1")
                print(
                    "[REPLIT DEBUG] Database connection pool created and tested successfully"
                )
                logger.info(
                    "Database connection pool created and tested successfully")
        else:
            print(
                "[REPLIT DEBUG] Warning: dbpool not created by connect_to_db")

        yield
    except Exception as e:
        error_msg = f"Failed to create database connection pool: {e}"
        print(f"[REPLIT DEBUG] {error_msg}")
        logger.error(error_msg)
        # Set dbpool to None so health check can handle it gracefully
        app.state.dbpool = None
        yield
    finally:
        # Close the Connection Pool
        try:
            await close_db_connection(app)
            print("[REPLIT DEBUG] Database connection pool closed")
            logger.info("Database connection pool closed")
        except Exception as e:
            error_msg = f"Error closing database connection pool: {e}"
            print(f"[REPLIT DEBUG] {error_msg}")
            logger.error(error_msg)


# Build description with xarray info
description = """Dynamic Raster Tiler with PgSTAC backend.

---

**Documentation**: <a href="https://stac-utils.github.io/titiler-pgstac/" target="_blank">https://stac-utils.github.io/titiler-pgstac/</a>

**Source Code**: <a href="https://github.com/stac-utils/titiler-pgstac" target="_blank">https://github.com/stac-utils/titiler-pgstac</a>
"""

if XARRAY_AVAILABLE:
    description += """
**Xarray Support**: This instance includes support for Zarr/NetCDF datasets via TiTiler-Xarray.

**Xarray Documentation**: <a href="https://developmentseed.org/titiler/" target="_blank">https://developmentseed.org/titiler/</a>
"""

description += "\n---\n"

app = FastAPI(
    title=settings.name,
    openapi_url="/api",
    docs_url="/api.html",
    description=description,
    version=titiler_pgstac_version,
    root_path=settings.root_path,
    lifespan=lifespan,
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    # Use both print and logger for Replit
    print(f"[REPLIT REQUEST] {request.method} {request.url}")
    logger.info(f"Request: {request.method} {request.url}")

    response = await call_next(request)

    print(f"[REPLIT RESPONSE] {response.status_code}")
    logger.info(f"Response: {response.status_code}")
    return response


# Fix OpenAPI response header for OGC Common compatibility
update_openapi(app)

# Build error codes dict
ERRORS = {**DEFAULT_STATUS_CODES, **MOSAIC_STATUS_CODES, **PGSTAC_STATUS_CODES}

add_exception_handlers(app, ERRORS)

# Set all CORS enabled origins
if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

app.add_middleware(
    CacheControlMiddleware,
    cachecontrol=settings.cachecontrol,
    exclude_path=settings.cachecontrol_exclude_paths,
)

optional_headers = []
if settings.debug:
    app.add_middleware(TotalTimeMiddleware)
    app.add_middleware(LoggerMiddleware)

    optional_headers = [OptionalHeader.server_timing, OptionalHeader.x_assets]

    @app.get("/collections", include_in_schema=False, tags=["DEBUG"])
    async def list_collections(request: Request):
        """list collections."""
        try:
            with request.app.state.dbpool.connection() as conn:
                with conn.cursor(row_factory=dict_row) as cursor:
                    cursor.execute("SELECT * FROM pgstac.all_collections();")
                    r = cursor.fetchone()
                    cols = r.get("all_collections", [])
                    return [col["id"] for col in cols]
        except Exception as e:
            logger.error(f"Error in list_collections: {e}")
            return {"error": str(e)}

    @app.get("/collections/{collection_id}",
             include_in_schema=False,
             tags=["DEBUG"])
    async def get_collection(request: Request, collection_id: str = Path()):
        """get collection."""
        try:
            with request.app.state.dbpool.connection() as conn:
                with conn.cursor(row_factory=dict_row) as cursor:
                    cursor.execute(
                        "SELECT * FROM get_collection(%s);",
                        (collection_id, ),
                    )
                    r = cursor.fetchone()
                    return r.get("get_collection") or {}
        except Exception as e:
            logger.error(f"Error in get_collection: {e}")
            return {"error": str(e)}

    @app.get("/pgstac", include_in_schema=False, tags=["DEBUG"])
    def pgstac_info(request: Request) -> Dict:
        """Retrieve PgSTAC Info."""
        try:
            with request.app.state.dbpool.connection() as conn:
                with conn.cursor(row_factory=dict_row) as cursor:
                    cursor.execute("SELECT pgstac.readonly()")
                    pgstac_readonly = cursor.fetchone()["readonly"]

                    cursor.execute("SELECT pgstac.get_version();")
                    pgstac_version = cursor.fetchone()["get_version"]

            return {
                "pgstac_version": pgstac_version,
                "pgstac_readonly": pgstac_readonly,
            }
        except Exception as e:
            logger.error(f"Error in pgstac_info: {e}")
            return {"error": str(e)}


TITILER_CONFORMS_TO = {
    "http://www.opengis.net/spec/ogcapi-common-1/1.0/req/core",
    "http://www.opengis.net/spec/ogcapi-common-1/1.0/req/landing-page",
    "http://www.opengis.net/spec/ogcapi-common-1/1.0/req/oas30",
    "http://www.opengis.net/spec/ogcapi-common-1/1.0/req/html",
    "http://www.opengis.net/spec/ogcapi-common-1/1.0/req/json",
}


@app.get("/status",
         description="Application Status Check",
         tags=["Health Check"])
def ping(
    timeout: int = Query(
        1, description="Timeout getting SQL connection from the pool."),
) -> Dict:
    """Health check with better error handling for Replit."""
    print("[REPLIT DEBUG] db-diagnostic check endpoint called")
    logger.info("Health check requested")

    db_online = False
    db_error = None

    try:
        print("[REPLIT DEBUG] Checking if dbpool exists...")
        # Check if dbpool exists
        if not hasattr(app.state, 'dbpool') or app.state.dbpool is None:
            db_error = "Database pool not initialized"
            print(f"[REPLIT DEBUG] {db_error}")
        else:
            print("[REPLIT DEBUG] Database pool exists, testing connection...")

            # Try multiple times with fresh connections
            max_retries = 2
            for attempt in range(max_retries):
                try:
                    print(
                        f"[REPLIT DEBUG] Connection attempt {attempt + 1}/{max_retries}"
                    )
                    # Use very short timeout for Replit
                    with app.state.dbpool.connection(timeout=2) as conn:
                        # Simple test query
                        result = conn.execute("SELECT 1 as test").fetchone()
                        if result and result[0] == 1:
                            db_online = True
                            print(
                                "[REPLIT DEBUG] Database connection successful"
                            )
                            logger.info("Database connection successful")
                            break
                except (OperationalError, PoolTimeout) as e:
                    error_msg = f"Attempt {attempt + 1} failed: {str(e)}"
                    print(f"[REPLIT DEBUG] {error_msg}")
                    if attempt == max_retries - 1:  # Last attempt
                        db_error = f"Database connection failed after {max_retries} attempts: {str(e)}"
                        logger.error(db_error)
                    else:
                        # Wait a bit before retry
                        import time
                        time.sleep(0.5)

    except Exception as e:
        db_error = f"Unexpected error: {str(e)}"
        print(f"[REPLIT DEBUG] {db_error}")
        logger.error(db_error)

    result = {
        "database_online": db_online,
        "versions": {
            "titiler": titiler_version,
            "titiler.pgstac": titiler_pgstac_version,
            "rasterio": rasterio.__version__,
            "gdal": rasterio.__gdal_version__,
            "proj": rasterio.__proj_version__,
            "geos": rasterio.__geos_version__,
        },
    }

    # Add xarray version if available
    if XARRAY_AVAILABLE:
        result["versions"]["titiler.xarray"] = titiler_xarray_version
        result["xarray_full_dependencies"] = XARRAY_FULL

    if db_error:
        result["database_error"] = db_error

    print(f"[REPLIT DEBUG] Health check result: {result}")
    return result


# Add a simple test endpoint to verify routing
@app.get("/test", tags=["DEBUG"])
def test_endpoint():
    """Simple test endpoint to verify routing works."""
    return {
        "status": "ok",
        "message": "TiTiler is running on Replit",
        "xarray_support": XARRAY_AVAILABLE,
        "xarray_full": XARRAY_FULL
    }


@app.get("/routes", tags=["DEBUG"])
def list_routes():
    """List all registered routes."""
    routes = []
    for route in app.router.routes:
        if hasattr(route, 'path'):
            routes.append({
                "path":
                route.path,
                "name":
                route.name,
                "methods":
                list(route.methods) if hasattr(route, 'methods') else []
            })
    return {"routes": sorted(routes, key=lambda x: x['path'])}


@app.get("/logs-test", tags=["DEBUG"])
def test_logging():
    """Test all logging methods."""
    print("[REPLIT DEBUG] Testing print statement")
    logger.info("Testing logger.info")
    logger.error("Testing logger.error")
    logger.warning("Testing logger.warning")

    return {
        "message":
        "Check Replit console for log messages",
        "methods_tested":
        ["print", "logger.info", "logger.error", "logger.warning"]
    }


@app.get("/db-diagnostic", tags=["DEBUG"])
def database_diagnostic():
    """Comprehensive database diagnostic."""
    print("[REPLIT DEBUG] Running database diagnostic...")

    diagnostics = {
        "connection_pool": {
            "exists": hasattr(app.state, 'dbpool')
            and app.state.dbpool is not None,
            "stats": None
        },
        "direct_connection": {
            "success": False,
            "error": None
        },
        "pgstac_check": {
            "schema_exists": False,
            "version": None,
            "error": None
        }
    }

    # Check connection pool stats
    if diagnostics["connection_pool"]["exists"]:
        try:
            pool = app.state.dbpool
            diagnostics["connection_pool"]["stats"] = {
                "size": pool.get_stats().get("pool_size", "unknown"),
                "available": pool.get_stats().get("pool_available", "unknown"),
            }
        except Exception as e:
            diagnostics["connection_pool"]["error"] = str(e)

    # Test direct connection
    try:
        import psycopg
        params = {
            'host': os.environ.get('PGHOST', 'localhost'),
            'database': os.environ.get('PGDATABASE', 'postgres'),
            'user': os.environ.get('PGUSER', 'postgres'),
            'password': os.environ.get('PGPASSWORD', ''),
            'port': os.environ.get('PGPORT', '5432'),
        }

        conn_string = f"postgresql://{params['user']}:{params['password']}@{params['host']}:{params['port']}/{params['database']}"

        with psycopg.connect(conn_string, connect_timeout=5) as conn:
            result = conn.execute("SELECT 1").fetchone()
            if result[0] == 1:
                diagnostics["direct_connection"]["success"] = True

                # Check PgSTAC
                try:
                    schema_check = conn.execute(
                        "SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name='pgstac')"
                    ).fetchone()
                    diagnostics["pgstac_check"][
                        "schema_exists"] = schema_check[0]

                    if diagnostics["pgstac_check"]["schema_exists"]:
                        version_result = conn.execute(
                            "SELECT pgstac.get_version()").fetchone()
                        diagnostics["pgstac_check"][
                            "version"] = version_result[0]
                except Exception as e:
                    diagnostics["pgstac_check"]["error"] = str(e)

    except Exception as e:
        diagnostics["direct_connection"]["error"] = str(e)

    print(f"[REPLIT DEBUG] Database diagnostic result: {diagnostics}")
    return diagnostics


@app.get("/which-main")
def which_main():
    return {
        "file": "custom main.py with xarray support",
        "timestamp": "2024-12-15",
        "xarray_enabled": XARRAY_AVAILABLE,
        "xarray_full": XARRAY_FULL
    }


###############################################################################
# TileMatrixSet endpoints
tms = TMSFactory()
app.include_router(tms.router, tags=["Tiling Schemes"])

###############################################################################
# COG endpoints - the standard TilerFactory includes all tile endpoints
cog = TilerFactory()
app.include_router(cog.router, prefix="/cog", tags=["Cloud Optimized GeoTIFF"])

# For debugging - print out the COG routes
print("[REPLIT DEBUG] COG Factory routes:")
for route in cog.router.routes:
    if hasattr(route, 'path'):
        print(f"  - {route.path}")

###############################################################################
# ColorMaps endpoints
colormap = ColorMapFactory()
app.include_router(colormap.router, prefix="/colormap", tags=["ColorMaps"])

###############################################################################
# Algorithms endpoints
algorithms = AlgorithmFactory()
app.include_router(algorithms.router, prefix="/algorithm", tags=["Algorithms"])

###############################################################################
# Multi-dimensional (Zarr/NetCDF) endpoints
if XARRAY_AVAILABLE and XARRAY_FULL:
    print("[REPLIT DEBUG] Adding Xarray/Multi-dimensional endpoints...")

    # Create custom reader if needed, or use default
    # The default reader requires the [minimal] dependencies
    md = XarrayTilerFactory(
        router_prefix="/md",
        extensions=[
            VariablesExtension(),
        ],
    )

    app.include_router(
        md.router,
        prefix="/md",  # Multi-dimensional prefix
        tags=["Multi Dimensional (Zarr/NetCDF)"])

    print(
        "[REPLIT DEBUG] Xarray/Multi-dimensional endpoints added successfully")

    # Add a test endpoint for the Zarr URL
    @app.get("/md-test", tags=["Multi Dimensional (Zarr/NetCDF)"])
    def test_multidimensional_endpoint():
        """Test endpoint to validate Zarr dataset access."""
        try:
            zarr_url = "https://data.dynamical.org/noaa/gefs/forecast-35-day/latest.zarr"

            # Test opening the dataset
            ds = xarray.open_zarr(zarr_url)

            # Get basic info about the dataset
            variables = list(ds.data_vars.keys())
            coords = list(ds.coords.keys())
            dims = dict(ds.dims)

            return {
                "status": "success",
                "zarr_url": zarr_url,
                "variables": variables[:10],  # First 10 variables
                "coordinates": coords,
                "dimensions": dims,
                "message": "Zarr dataset successfully accessed"
            }
        except Exception as e:
            return {
                "status": "error",
                "zarr_url": zarr_url,
                "error": str(e),
                "message": "Failed to access Zarr dataset"
            }

elif XARRAY_AVAILABLE and not XARRAY_FULL:
    print("[REPLIT DEBUG] Xarray available but minimal dependencies missing")

    @app.get("/md/info", tags=["Multi Dimensional (Zarr/NetCDF)"])
    def xarray_minimal_missing():
        """Multi-dimensional support information."""
        return {
            "status": "partially available",
            "message":
            "TiTiler-Xarray is installed but minimal dependencies are missing",
            "install_command": "pip install 'titiler.xarray[minimal]'",
            "required_packages": ["zarr", "h5netcdf", "fsspec"],
            "documentation": "https://developmentseed.org/titiler/"
        }
else:
    print(
        "[REPLIT DEBUG] Xarray endpoints NOT added (titiler.xarray not installed)"
    )

    @app.get("/md/info", tags=["Multi Dimensional (Zarr/NetCDF)"])
    def xarray_not_available():
        """Multi-dimensional support information."""
        return {
            "status":
            "not available",
            "message":
            "TiTiler-Xarray is not installed",
            "install_options": {
                "minimal":
                "pip install 'titiler.xarray[minimal]' # For basic Zarr/NetCDF support",
                "full":
                "pip install 'titiler.xarray[full]' # Includes S3, GCS, HTTP support",
                "s3":
                "pip install 'titiler.xarray[s3]' # For S3 support only",
                "gcs":
                "pip install 'titiler.xarray[gcs]' # For Google Cloud Storage only",
            },
            "documentation":
            "https://developmentseed.org/titiler/",
            "github":
            "https://github.com/developmentseed/titiler/tree/main/src/titiler/xarray"
        }


###############################################################################
# Healthcheck endpoint
@app.get(
    "/healthz",
    description="Health Check.",
    summary="Health Check.",
    operation_id="healthCheck",
    tags=["Health Check"],
)
def healthz():
    """Health check."""
    return {"ping": "pong!"}
