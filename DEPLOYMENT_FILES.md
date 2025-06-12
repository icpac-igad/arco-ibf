# Essential Files for TiTiler-PgSTAC Deployment

## Core TiTiler-PgSTAC Files (Required)

### From titiler-pgstac/titiler/pgstac/
```
titiler-pgstac/titiler/pgstac/__init__.py          # Package initialization with version
titiler-pgstac/titiler/pgstac/main.py              # Main FastAPI application
titiler-pgstac/titiler/pgstac/backend.py           # Database backend
titiler-pgstac/titiler/pgstac/db.py                # Database connection utilities
titiler-pgstac/titiler/pgstac/dependencies.py     # FastAPI dependencies
titiler-pgstac/titiler/pgstac/extensions.py        # TiTiler extensions
titiler-pgstac/titiler/pgstac/factory.py           # Endpoint factories
titiler-pgstac/titiler/pgstac/model.py             # Data models
titiler-pgstac/titiler/pgstac/reader.py            # STAC readers
titiler-pgstac/titiler/pgstac/settings.py          # Configuration settings
titiler-pgstac/titiler/pgstac/errors.py            # Error handling
```

### Package Structure Files
```
titiler-pgstac/titiler/__init__.py                 # Create empty file if missing
```

## Deployment Support Files (Current Project)

### Essential Services
```
start_services.py                                  # Service orchestration
nginx.conf                                         # Nginx proxy configuration
main.py                                           # Entry point (now titiler.xarray)
```

### Database Setup
```
setup_database_replit.py                          # PostgreSQL + PostGIS setup
```

### Configuration
```
pyproject.toml                                     # Dependencies
```

## Minimal Deployment Structure

For a clean titiler-pgstac deployment, you need:

### 1. Core Application
```
app/
├── titiler/
│   └── pgstac/
│       ├── __init__.py
│       ├── main.py
│       ├── backend.py
│       ├── db.py
│       ├── dependencies.py
│       ├── extensions.py
│       ├── factory.py
│       ├── model.py
│       ├── reader.py
│       ├── settings.py
│       └── errors.py
├── main.py (entry point)
├── start_services.py (optional - for Nginx proxy)
└── pyproject.toml
```

### 2. Infrastructure (Optional)
```
nginx.conf (if using proxy)
setup_database.py (for initial DB setup)
```

## Files NOT Required for Basic Deployment

### Test Files
```
titiler-pgstac/tests/                             # Skip all test files
titiler-pgstac/.github/                           # Skip CI/CD files
titiler-pgstac/benchmark/                         # Skip benchmark files
```

### Development Files
```
test_*.py                                         # All test scripts
*_test.py                                         # Test utilities
install_*.py                                      # Installation helpers
gdal_*.py                                         # GDAL-specific utilities
```

### Alternative Implementations
```
main_backup.py                                    # Backup files
main_new.py                                       # Alternative versions
nginx_main.py                                     # Alternative main files
replit_titiler_alternative.py                     # Platform-specific alternatives
titiler_app.py                                    # Custom implementations
```

## Key Dependencies (pyproject.toml)

### Required Python Packages
```toml
dependencies = [
    "fastapi",
    "uvicorn",
    "psycopg[binary,pool]",
    "titiler.pgstac",
    "titiler.xarray[full]",  # For multidimensional data
]
```

### For Zarr/NetCDF Support
```toml
zarr-dependencies = [
    "xarray",
    "zarr", 
    "netcdf4",
    "fsspec",
    "s3fs",
    "gcsfs"
]
```

## Recommended Clean Deployment

### Option 1: Pure TiTiler-PgSTAC
```
main.py (from titiler-pgstac/titiler/pgstac/main.py)
pyproject.toml
setup_database.py (for initial setup)
```

### Option 2: With Nginx Proxy (Current Setup)
```
titiler-pgstac/titiler/pgstac/ (core files)
main.py (entry point)
start_services.py
nginx.conf
pyproject.toml
```

### Option 3: TiTiler.Xarray (For Zarr/NetCDF)
```
main.py (titiler.xarray implementation)
pyproject.toml (with xarray dependencies)
```