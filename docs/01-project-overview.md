# TiTiler-PgSTAC on Replit: Project Overview

## Background

This repository contains a comprehensive implementation of TiTiler-PgSTAC on Replit, developed through multiple iterations and architectural decisions. The project enables serving geospatial tiles from STAC (SpatioTemporal Asset Catalog) data stored in PostgreSQL with PostGIS extensions.

## Project Evolution

### Initial Goal
Create a working TiTiler-PgSTAC deployment on Replit that can:
- Serve geospatial tiles from STAC data
- Handle multidimensional datasets (Zarr/NetCDF)
- Provide proper HTTPS URL generation
- Connect to external PostgreSQL databases
- Support NOAA GEFS forecast data visualization

### Architecture Decisions

#### 1. Database Strategy Evolution
- **Initial Approach**: Attempted to use Replit's built-in PostgreSQL
- **Challenge**: System dependency conflicts with GDAL installation
- **Final Solution**: External Neon Database with pgSTAC extensions
- **Rationale**: Separation of concerns - computational services on Replit, data services on specialized PostgreSQL hosting

#### 2. GDAL Installation Strategy
- **Challenge**: GDAL system dependencies conflict with Replit's environment
- **Solution**: Custom installation using unofficial GDAL wheels
- **Implementation**: Bypassed system package manager, used pre-built Python wheels
- **Result**: Successful GDAL, PROJ, and rasterio installation

#### 3. Proxy Architecture
- **Challenge**: TiTiler generates HTTP URLs instead of HTTPS in Replit environment
- **Solution**: Nginx reverse proxy for proper URL generation
- **Implementation**: Nginx proxies to TiTiler backend, handles HTTPS termination
- **Benefit**: Proper URL generation for tile endpoints

#### 4. Multi-dimensional Data Support
- **Evolution**: From pure pgSTAC to hybrid pgSTAC + TiTiler.xarray
- **Purpose**: Support for Zarr/NetCDF multidimensional datasets
- **Implementation**: Separate endpoints for STAC data vs. multidimensional data
- **Use Case**: NOAA GEFS weather forecast data visualization

## Repository Structure

### Core Components
```
├── titiler-pgstac/           # Cloned reference implementation
├── docs/                     # Comprehensive documentation
├── minimal_deployment/       # Production-ready minimal files
├── main.py                   # Application entry point
├── start_services.py         # Service orchestration
├── nginx.conf               # Reverse proxy configuration
└── pyproject.toml           # Dependencies and configuration
```

### Key Files by Function

#### Application Core
- `main.py` - TiTiler.xarray application for multidimensional data
- `titiler_app.py` - Full TiTiler-PgSTAC implementation
- `app.py` - Alternative Flask-based implementation

#### Infrastructure
- `start_services.py` - Nginx + TiTiler service orchestration
- `nginx.conf` - Reverse proxy configuration
- `run.py` - Production startup script

#### Database Setup
- `setup_database_replit.py` - PostgreSQL + PostGIS configuration
- `setup_pgstac_permissions.py` - Database permissions and schema setup
- `load_sample_stac_data.py` - STAC data loading utilities

#### Installation & Testing
- `install_gdal_replit.py` - GDAL installation for Replit
- `test_*.py` - Various testing utilities
- `titiler_pgstac_installation.py` - Complete installation script

## Technical Achievements

### 1. GDAL Integration
- Successful installation of GDAL 3.8+ on Replit
- Rasterio integration for geospatial data processing
- PROJ library for coordinate transformations

### 2. Database Integration
- PostgreSQL with PostGIS extensions
- pgSTAC schema for STAC data storage
- Connection pooling and optimization

### 3. Proxy Architecture
- Nginx reverse proxy for HTTPS URL generation
- Service orchestration with proper startup/shutdown
- Port management and health checks

### 4. Multi-format Support
- STAC data through pgSTAC
- Zarr/NetCDF through TiTiler.xarray
- COG (Cloud Optimized GeoTIFF) support
- Multidimensional dataset visualization

## Development Challenges Overcome

### System Dependencies
- **Problem**: GDAL installation conflicts with Replit's package manager
- **Solution**: Custom wheel-based installation bypassing system packages

### Database Connectivity
- **Problem**: PostgreSQL setup conflicts with GDAL dependencies
- **Solution**: External Neon database with optimized connection pooling

### URL Generation
- **Problem**: TiTiler generates HTTP URLs in Replit's HTTPS environment
- **Solution**: Nginx reverse proxy for proper HTTPS URL generation

### Service Orchestration
- **Problem**: Managing multiple services (Nginx + TiTiler) in Replit
- **Solution**: Custom service manager with proper process lifecycle management

## Data Sources

### Authentic Datasets
- **NOAA GEFS**: Weather forecast data from NOAA's Global Ensemble Forecast System
- **Zarr Format**: Multidimensional arrays for climate data
- **STAC Catalogs**: Geospatial metadata following STAC specifications

### Sample Data
- STAC collections and items for testing
- Weather forecast variables (temperature, precipitation, wind)
- Global coverage at multiple resolutions

## Deployment Scenarios

### Development Mode
- Direct Python execution
- Built-in debugging and logging
- Hot reload capabilities

### Production Mode
- Nginx reverse proxy
- Process management
- Health checks and monitoring
- Optimized for Replit's hosting environment

## Future Enhancements

### Performance Optimization
- Caching strategies for frequently accessed tiles
- Database query optimization
- CDN integration for static assets

### Data Pipeline
- Automated STAC data ingestion
- Real-time weather data updates
- Data validation and quality checks

### API Extensions
- Custom colormap definitions
- Advanced filtering capabilities
- Batch processing endpoints

This project demonstrates a complete geospatial data serving solution adapted specifically for Replit's hosting environment, overcoming multiple technical challenges to deliver a production-ready tile server.