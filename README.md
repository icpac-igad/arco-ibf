# TiPG Vector Tile Server

Quick deployment guide for TiPG server on Replit with PostgreSQL and PostGIS.

## Replit Deployment

Deploy using the published template: https://replit.com/@e4drr/TipgTiler-template

The template includes:
- PostgreSQL 16 with PostGIS extension (pre-configured)
- Python 3.11 runtime
- Automated dependency installation via `.replit` configuration

## Quick Start

1. Fork the template on Replit
2. Click "Run" to start the server
3. TiPG server runs on port 5000

## Custom Endpoints

### Rainfall Data (Parquet from GCS)
- `/rainfall/{zone}/{date}` - Rainfall data for specific zone and date
- `/rainfall/{zone}/timeseries/{gridcode}` - Time series for gridcode
- `/collections/geofsm_zones/rainfall/{date}` - Combined spatial and rainfall data

Data source: 22MB parquet file from GCS bucket with 16M+ rainfall records

### Stream Order Filtering (MVT)
- `/collections/public.ea_river_networks_tdx_v2/tiles/WebMercatorQuad/{z}/{x}/{y}?stream_order_min={value}`

Filters river network tiles by minimum stream order for optimized rendering.

## Project Structure

### `/rivers`
- River network processing for East Africa
- Downloads from TDX-Hydro global dataset (AWS S3: `geoglows-v2`)
- Processes 11 countries: Ethiopia, Sudan, South Sudan, Somalia, Kenya, Tanzania, Uganda, Rwanda, Burundi, Djibouti, Eritrea
- 319,783 stream features across 8 VPUs
- Scripts: `process_east_africa_minimal.py`, `resume_ea_upload_v2.py`

### `/subbasins`
- Shapefile/GeoJSON upload routines for subbasin collections
- Rainfall endpoint integration
- Scripts: `upload_shapefile_only.py`, `parquet_rain_data_manager.py`

### `/points`
- Point data upload from XLSX/shapefile/GeoJSON
- Creates point geometry collections in TiPG
- Scripts: `upload_points_from_xlsx.py`

## Core Files

- `tipg_server_parquet.py` - Main TiPG server with custom rainfall and stream order endpoints
- `.replit` - Deployment configuration with PostgreSQL setup and port mapping
- `parquet_rain_data_manager.py` - GCS parquet data access manager

## Database Setup

PostgreSQL with PostGIS is automatically configured in Replit. Collections are created by uploading shapefiles/GeoJSON to respective folder scripts.

## Data Sources

- **Rainfall**: GCS parquet file (`geosfm/tidy_rainfall_data.parquet`)
- **Rivers**: TDX-Hydro via GEOGloWS v2 (AWS S3)
- **Points/Subbasins**: User-uploaded shapefiles/GeoJSON

## Usage

Upload spatial data using folder-specific scripts, then access via TiPG OGC API endpoints or custom rainfall/stream order endpoints for web mapping applications.