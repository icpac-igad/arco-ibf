"""
TiPG Vector Tile Server with Parquet-based Rainfall Data
Uses GCS Parquet file instead of local txt files for rainfall data
"""

import os
import asyncio
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from tipg.main import app as tipg_app
from tipg.settings import PostgresSettings, DatabaseSettings
from starlette.middleware.cors import CORSMiddleware
from typing import Optional
from parquet_rain_data_manager import parquet_rain_data_manager, safe_float_conversion
import logging

logger = logging.getLogger(__name__)

# Configure TiPG environment variables
os.environ.setdefault("TIPG_DEBUG", "TRUE")
os.environ.setdefault("TIPG_DB_SCHEMAS", "public")
os.environ.setdefault("TIPG_DB_ONLY_SPATIAL_TABLES", "FALSE")  # Include all tables
os.environ.setdefault("TIPG_DEFAULT_MINZOOM", "0")
os.environ.setdefault("TIPG_DEFAULT_MAXZOOM", "22")
os.environ.setdefault("TIPG_NAME", "TiPG Vector Tile Server with Parquet Rainfall Data")

# Use the main TiPG app which handles database initialization properly
app = tipg_app

# Add custom rainfall endpoints to the TiPG app using Parquet data
@app.get("/rainfall/{zone}/{date}")
async def get_rainfall_by_date(
    zone: str,
    date: str,
    gridcode: Optional[int] = Query(None, description="Specific GRIDCODE to query")
):
    """Get rainfall data for a specific zone and date from Parquet"""
    
    data = parquet_rain_data_manager.get_rainfall_for_date(zone, date, gridcode)
    
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for {zone} on {date}")
        
    return JSONResponse(content=data)


@app.get("/rainfall/{zone}/timeseries/{gridcode}")
async def get_rainfall_timeseries(
    zone: str,
    gridcode: int,
    start_date: Optional[str] = Query(None, description="Start date in YYYYDDD or YYYY-MM-DD format"),
    end_date: Optional[str] = Query(None, description="End date in YYYYDDD or YYYY-MM-DD format")
):
    """Get time series rainfall data for a specific GRIDCODE from Parquet"""
    
    data = parquet_rain_data_manager.get_rainfall_timeseries(zone, gridcode, start_date, end_date)
    
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for gridcode {gridcode} in {zone}")
        
    return JSONResponse(content={
        'zone': zone,
        'gridcode': gridcode,
        'timeseries': data
    })


@app.get("/rainfall/{zone}/summary/{date}")
async def get_zone_summary(zone: str, date: str):
    """Get rainfall summary statistics for a zone on a specific date from Parquet"""
    
    summary = parquet_rain_data_manager.get_zone_summary(zone, date)
    
    if summary is None:
        raise HTTPException(status_code=404, detail=f"No data found for {zone} on {date}")
        
    return JSONResponse(content=summary)


@app.get("/rainfall/zones")
async def list_available_zones():
    """List all available rainfall zones from Parquet data"""
    
    try:
        zones = parquet_rain_data_manager.get_available_zones()
        
        if not zones:
            # If no zones available, return error with details
            return JSONResponse(
                status_code=500,
                content={
                    'error': 'No rainfall data available',
                    'data_loaded': parquet_rain_data_manager.loaded,
                    'data_source': 'GCS Parquet'
                }
            )
        
        return JSONResponse(content={
            'zones': [{'zone': zone, 'source': 'parquet', 'exists': True} for zone in zones],
            'data_source': 'GCS Parquet',
            'total_zones': len(zones)
        })
        
    except Exception as e:
        logger.error(f"Error getting zones: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                'error': f'Failed to get zones: {str(e)}',
                'data_loaded': parquet_rain_data_manager.loaded,
                'data_source': 'GCS Parquet'
            }
        )


@app.get("/rainfall/dates/{zone}")
async def get_available_dates(zone: str, limit: int = Query(10, description="Number of dates to return")):
    """Get available dates for a zone from Parquet data"""
    
    try:
        dates_info = parquet_rain_data_manager.get_available_dates(zone, limit)
        
        if dates_info is None:
            raise HTTPException(status_code=404, detail=f"Zone {zone} not found")
            
        return JSONResponse(content=dates_info)
        
    except Exception as e:
        logger.error(f"Error getting dates for zone {zone}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get dates for zone {zone}: {str(e)}")


@app.get("/rainfall/{zone}/gridcodes")
async def get_zone_gridcodes(zone: str):
    """Get all gridcodes available for a zone"""
    
    try:
        gridcodes = parquet_rain_data_manager.get_gridcodes_for_zone(zone)
        
        if not gridcodes:
            raise HTTPException(status_code=404, detail=f"Zone {zone} not found or has no gridcodes")
            
        return JSONResponse(content={
            'zone': zone,
            'gridcodes': gridcodes,
            'total_gridcodes': len(gridcodes)
        })
        
    except Exception as e:
        logger.error(f"Error getting gridcodes for zone {zone}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get gridcodes for zone {zone}: {str(e)}")


@app.get("/collections/geofsm_zones/rainfall/{date}")
async def get_spatial_rainfall_data(
    date: str,
    zone: Optional[str] = Query(None, description="Specific zone to get data for (if None, returns all zones)"),
    bbox: Optional[str] = Query(None, description="Bounding box filter"),
    format: Optional[str] = Query("json", description="Output format: json, geojson")
):
    """
    Get combined spatial and rainfall data for visualization from Parquet
    This endpoint is designed for choropleth map rendering and deck.gl compatibility
    Returns data for all zones unless specific zone is requested
    """
    
    try:
        logger.info(f"Collections endpoint called with zone={zone}, date={date}, format={format}")
        
        # If no specific zone requested, get data for ALL zones using progressive loading
        if zone is None:
            logger.info("Processing ALL zones using progressive loading")
            # Use progressive loading approach - tested to use only ~199MB for all 6 zones
            available_zones = parquet_rain_data_manager.get_available_zones()
            
            all_zones_data = {}
            zone_summaries = {}
            successful_zones = 0
            
            # Load zones progressively to control memory usage
            for zone_name in available_zones:
                try:
                    # Load one zone at a time
                    rainfall_data = parquet_rain_data_manager.get_rainfall_for_date(zone_name, date)
                    
                    if rainfall_data and 'data' in rainfall_data:
                        # Create gridcode to rainfall mapping for this zone
                        zone_gridcode_rainfall = {
                            item['gridcode']: safe_float_conversion(item['rainfall']) 
                            for item in rainfall_data['data']
                        }
                        all_zones_data[zone_name] = zone_gridcode_rainfall
                        
                        # Get summary for this zone
                        zone_summaries[zone_name] = parquet_rain_data_manager.get_zone_summary(zone_name, date)
                        successful_zones += 1
                    
                    # Force garbage collection between zones to release memory
                    import gc
                    gc.collect()
                    
                except Exception as e:
                    logger.warning(f"Failed to load {zone_name} for date {date}: {e}")
                    continue
            
            if not all_zones_data:
                raise HTTPException(status_code=404, detail=f"No rainfall data found for any zone on date {date}")
            
            # Format response
            response_data = {
                'type': 'AllZonesRainfallData',
                'date': date,
                'zones_data': all_zones_data,
                'zone_summaries': zone_summaries,
                'total_zones': len(all_zones_data),
                'successful_zones': successful_zones,
                'available_zones': len(available_zones),
                'memory_approach': 'Progressive Loading (All Zones)',
                'data_source': 'GCS Parquet (Memory-Optimized)'
            }
            
        else:
            logger.info(f"Processing SINGLE zone: {zone}")
            # Get data for specific zone
            rainfall_data = parquet_rain_data_manager.get_rainfall_for_date(zone, date)
            
            if rainfall_data is None:
                raise HTTPException(status_code=404, detail=f"No rainfall data found for {zone} on date {date}")
            
            # Create a mapping of GRIDCODE to rainfall value
            gridcode_rainfall = {
                item['gridcode']: safe_float_conversion(item['rainfall']) 
                for item in rainfall_data['data']
            }
            
            response_data = {
                'type': 'SingleZoneRainfallData',
                'zone': zone,
                'date': date,
                'gridcode_rainfall': gridcode_rainfall,
                'summary': parquet_rain_data_manager.get_zone_summary(zone, date),
                'data_source': 'GCS Parquet'
            }
        
        # Format as GeoJSON if requested (for deck.gl compatibility)
        if format.lower() == "geojson":
            # Convert to GeoJSON-like structure for deck.gl
            features = []
            
            if zone is None:
                # Multi-zone GeoJSON
                zones_data = response_data['zones_data']
                for zone_name, gridcode_data in zones_data.items():
                    for gridcode, rainfall in gridcode_data.items():
                        features.append({
                            "type": "Feature",
                            "properties": {
                                "gridcode": gridcode,
                                "rainfall": safe_float_conversion(rainfall),
                                "zone": zone_name,
                                "date": date
                            },
                            "geometry": None  # Geometry would be added by joining with spatial data
                        })
            else:
                # Single zone GeoJSON
                for gridcode, rainfall in gridcode_rainfall.items():
                    features.append({
                        "type": "Feature", 
                        "properties": {
                            "gridcode": gridcode,
                            "rainfall": safe_float_conversion(rainfall),
                            "zone": zone,
                            "date": date
                        },
                        "geometry": None  # Geometry would be added by joining with spatial data
                    })
            
            # Create metadata
            if zone is None:
                zones_list = list(response_data['zones_data'].keys())
            else:
                zones_list = [zone]
                
            response_data = {
                "type": "FeatureCollection",
                "features": features,
                "metadata": {
                    "date": date,
                    "zones": zones_list,
                    "total_features": len(features),
                    "data_source": "GCS Parquet (Ultra-Efficient)"
                }
            }
        
        return JSONResponse(content=response_data)
        
    except Exception as e:
        logger.error(f"Error getting spatial rainfall data for date {date}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get rainfall data: {str(e)}")


@app.get("/rainfall/data-info")
async def get_data_info():
    """Get information about the loaded rainfall dataset"""
    
    if not parquet_rain_data_manager.loaded:
        if not parquet_rain_data_manager.load_rainfall_data():
            raise HTTPException(status_code=500, detail="Failed to load rainfall data")
    
    df = parquet_rain_data_manager.rainfall_df
    zones = parquet_rain_data_manager.get_available_zones()
    
    return JSONResponse(content={
        'data_source': 'GCS Parquet',
        'bucket': parquet_rain_data_manager.bucket_name,
        'file': parquet_rain_data_manager.parquet_file,
        'total_records': len(df),
        'date_range': {
            'start': df['date'].min().strftime('%Y-%m-%d'),
            'end': df['date'].max().strftime('%Y-%m-%d')
        },
        'zones': zones,
        'total_gridcodes': len(df['gridcode'].unique()),
        'non_zero_records': len(df[df['rainfall_mm'] > 0]),
        'max_rainfall': safe_float_conversion(df['rainfall_mm'].max()),
        'mean_rainfall': safe_float_conversion(df[df['rainfall_mm'] > 0]['rainfall_mm'].mean()) if len(df[df['rainfall_mm'] > 0]) > 0 else 0
    })


# Add startup event for rainfall data loading
@app.on_event("startup")
async def load_rainfall_data():
    """Load rainfall data from GCS Parquet on startup"""
    logger.info("Loading rainfall data from GCS Parquet...")
    try:
        success = parquet_rain_data_manager.load_rainfall_data()
        if success:
            logger.info("Parquet rainfall data loaded successfully")
        else:
            logger.error("Failed to load Parquet rainfall data")
    except Exception as e:
        logger.error(f"Error loading Parquet rainfall data: {e}")
        # Continue without rainfall data


# Add a health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    
    # Test if parquet data is accessible (without loading full dataset)
    parquet_accessible = False
    zones = []
    try:
        zones = parquet_rain_data_manager.get_available_zones()
        parquet_accessible = len(zones) > 0
    except Exception as e:
        logger.error(f"Parquet data not accessible: {e}")
        parquet_accessible = False
    
    return {
        "status": "healthy",
        "service": "TiPG Vector Tile Server with Parquet Rainfall Data",
        "database_connected": hasattr(app.state, 'pool') and app.state.pool is not None,
        "rainfall_data_loaded": parquet_accessible,  # True if we can access parquet data
        "rainfall_zones_available": len(zones) if parquet_accessible else 0,
        "data_source": "GCS Parquet",
        "memory_efficient": True  # Indicates we use optimized loading
    }


if __name__ == "__main__":
    # Get host and port from environment
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    
    print(f"Starting TiPG Vector Tile Server with Parquet Rainfall Data on {host}:{port}")
    print(f"Database URL configured: {bool(os.getenv('DATABASE_URL'))}")
    print(f"GCS Bucket: {parquet_rain_data_manager.bucket_name}")
    print(f"Parquet File: {parquet_rain_data_manager.parquet_file}")
    
    # Run the server
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info"
    )