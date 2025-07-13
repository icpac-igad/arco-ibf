"""
Upload geofsm-prod-all-zones-20240712.shp to PostgreSQL for TiPG
Keep only spatial data in database, time series data will be loaded from text files
"""

import os
import geopandas as gpd
from sqlalchemy import create_engine, text
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get database URL
DATABASE_URL = os.getenv('DATABASE_URL', '')


def upload_spatial_data(shapefile_path: str,
                        table_name: str = 'geofsm_zones_v2'):
    """Upload only spatial data from shapefile to PostgreSQL"""

    if not DATABASE_URL:
        logger.error("DATABASE_URL not configured")
        return False

    try:
        # Read shapefile
        logger.info(f"Reading shapefile: {shapefile_path}")
        gdf = gpd.read_file(shapefile_path)

        # Log shapefile info
        logger.info(f"Shapefile loaded: {len(gdf)} features")
        logger.info(f"Columns: {list(gdf.columns)}")
        logger.info(f"CRS: {gdf.crs}")
        logger.info(f"First few rows:")
        logger.info(gdf.head())

        # Ensure WGS84 projection
        if gdf.crs is None:
            logger.info("Setting CRS to WGS84")
            gdf.set_crs(epsg=4326, inplace=True)
        elif gdf.crs.to_epsg() != 4326:
            logger.info(f"Reprojecting from {gdf.crs} to WGS84")
            gdf = gdf.to_crs(epsg=4326)

        # Keep only essential columns for spatial identification
        # We need gridcode and zone for joining with text data
        essential_columns = ['geometry']
        if 'GRIDCODE' in gdf.columns:
            essential_columns.append('GRIDCODE')
        if 'zone' in gdf.columns:
            essential_columns.append('zone')

        # Add any other identifying columns
        for col in gdf.columns:
            if col not in essential_columns and col != 'geometry':
                logger.info(f"Found additional column: {col}")
                # Optionally keep other columns if needed

        gdf_spatial = gdf[essential_columns].copy()

        # Create database engine
        engine = create_engine(DATABASE_URL)

        # Upload to PostgreSQL
        logger.info(f"Uploading to table: {table_name}")

        # Rename GRIDCODE to lowercase for TiPG compatibility
        if 'GRIDCODE' in gdf_spatial.columns:
            gdf_spatial = gdf_spatial.rename(columns={'GRIDCODE': 'gridcode'})
        
        gdf_spatial.to_postgis(name=table_name,
                               con=engine,
                               if_exists='replace',
                               index=True,
                               index_label='id',
                               dtype={'geometry': 'geometry'})

        # Create spatial and attribute indexes
        with engine.connect() as conn:
            # Spatial index
            conn.execute(
                text(f"""
                CREATE INDEX IF NOT EXISTS idx_{table_name}_geom 
                ON {table_name} USING GIST (geometry)
            """))

            # Index on gridcode if exists
            if 'gridcode' in gdf_spatial.columns:
                conn.execute(
                    text(f"""
                    CREATE INDEX IF NOT EXISTS idx_{table_name}_gridcode
                    ON {table_name} (gridcode)
                """))

            # Index on zone if exists
            if 'zone' in gdf_spatial.columns:
                conn.execute(
                    text(f"""
                    CREATE INDEX IF NOT EXISTS idx_{table_name}_zone
                    ON {table_name} (zone)
                """))

            conn.commit()

        logger.info(
            f"Successfully uploaded {len(gdf_spatial)} spatial features to {table_name}"
        )

        # Verify upload
        with engine.connect() as conn:
            result = conn.execute(
                text(f"""
                SELECT COUNT(*) as count,
                       ST_Extent(geometry) as extent
                FROM {table_name}
            """))

            for row in result:
                logger.info(
                    f"Verification - Features: {row.count}, Extent: {row.extent}"
                )

        return True

    except Exception as e:
        logger.error(f"Error uploading shapefile: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False


def analyze_zone_files():
    """Analyze the zone rain text files to understand their structure"""

    zone_files = [f"zone{i}_rain.txt" for i in range(1, 7)]

    for zone_file in zone_files:
        if os.path.exists(zone_file):
            logger.info(f"\nAnalyzing {zone_file}:")

            with open(zone_file, 'r') as f:
                # Read first line (header)
                header = f.readline().strip()
                header_parts = header.split(',')
                logger.info(f"  Header columns: {len(header_parts)}")
                logger.info(f"  First column: {header_parts[0]}")
                logger.info(
                    f"  GRIDCODE values: {header_parts[1:][:5]}... (showing first 5)"
                )

                # Read a few data lines
                for i in range(3):
                    line = f.readline().strip()
                    if line:
                        parts = line.split(',')
                        date = parts[0]
                        values = parts[1:6]  # First 5 values
                        logger.info(
                            f"  Row {i+1} - Date: {date}, Values: {values}...")


if __name__ == "__main__":
    # Check if shapefile exists
    shapefile_path = "geofsm-prod-all-zones-20240712.shp"

    if not os.path.exists(shapefile_path):
        logger.error(f"Shapefile not found: {shapefile_path}")
        logger.info("Please ensure the shapefile is in the current directory")
    else:
        # First analyze the zone files
        logger.info("=== Analyzing Zone Rain Files ===")
        analyze_zone_files()

        # Upload spatial data only
        logger.info("\n=== Uploading Spatial Data ===")
        if upload_spatial_data(shapefile_path):
            logger.info("Spatial data upload successful!")
        else:
            logger.error("Failed to upload spatial data")
