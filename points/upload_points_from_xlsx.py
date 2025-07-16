"""
Upload GEOSFM-cf-latlong.xlsx points to PostgreSQL for TiPG
Process XLSX file with geopandas to create point geometries and upload as geosfm_points collection
"""

import os
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point
from sqlalchemy import create_engine, text
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get database URL
DATABASE_URL = os.getenv('DATABASE_URL', '')


def upload_points_from_xlsx(xlsx_path: str,
                           table_name: str = 'geosfm_points'):
    """Upload points from XLSX file to PostgreSQL for TiPG"""
    
    if not DATABASE_URL:
        logger.error("DATABASE_URL not configured")
        return False
    
    try:
        # Read XLSX file
        logger.info(f"Reading XLSX file: {xlsx_path}")
        df = pd.read_excel(xlsx_path)
        
        # Log file info
        logger.info(f"XLSX loaded: {len(df)} records")
        logger.info(f"Columns: {list(df.columns)}")
        logger.info(f"First few rows:")
        logger.info(df.head())
        
        # Validate required columns
        required_columns = ['XCoordinate', 'YCoordinate']
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            logger.error(f"Missing required columns: {missing_columns}")
            return False
        
        # Remove rows with missing coordinates
        df_clean = df.dropna(subset=['XCoordinate', 'YCoordinate'])
        if len(df_clean) < len(df):
            logger.info(f"Removed {len(df) - len(df_clean)} rows with missing coordinates")
        
        # Create Point geometries from coordinates
        logger.info("Creating point geometries from coordinates")
        geometry = [Point(xy) for xy in zip(df_clean['XCoordinate'], df_clean['YCoordinate'])]
        
        # Create GeoDataFrame
        gdf = gpd.GeoDataFrame(df_clean, geometry=geometry)
        
        # Set CRS to WGS84 (assuming coordinates are in longitude/latitude)
        gdf.set_crs(epsg=4326, inplace=True)
        
        # Remove original coordinate columns since we now have geometry
        columns_to_keep = [col for col in gdf.columns if col not in ['XCoordinate', 'YCoordinate']]
        gdf_final = gdf[columns_to_keep].copy()
        
        # Rename columns to lowercase for consistency
        gdf_final.columns = [col.lower() for col in gdf_final.columns]
        
        logger.info(f"Final GeoDataFrame: {len(gdf_final)} points")
        logger.info(f"Final columns: {list(gdf_final.columns)}")
        logger.info(f"CRS: {gdf_final.crs}")
        
        # Create database engine
        engine = create_engine(DATABASE_URL)
        
        # Upload to PostgreSQL
        logger.info(f"Uploading to table: {table_name}")
        
        gdf_final.to_postgis(name=table_name,
                            con=engine,
                            if_exists='replace',
                            index=True,
                            index_label='gid',
                            dtype={'geometry': 'geometry'})
        
        # Create spatial and attribute indexes
        with engine.connect() as conn:
            # Spatial index
            conn.execute(
                text(f"""
                CREATE INDEX IF NOT EXISTS idx_{table_name}_geom 
                ON {table_name} USING GIST (geometry)
            """))
            
            # Index on id if exists
            if 'id' in gdf_final.columns:
                conn.execute(
                    text(f"""
                    CREATE INDEX IF NOT EXISTS idx_{table_name}_id
                    ON {table_name} (id)
                """))
            
            # Index on name if exists
            if 'name' in gdf_final.columns:
                conn.execute(
                    text(f"""
                    CREATE INDEX IF NOT EXISTS idx_{table_name}_name
                    ON {table_name} (name)
                """))
            
            conn.commit()
        
        logger.info(
            f"Successfully uploaded {len(gdf_final)} points to {table_name}"
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
                    f"Verification - Points: {row.count}, Extent: {row.extent}"
                )
        
        return True
        
    except Exception as e:
        logger.error(f"Error uploading points from XLSX: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False


def analyze_xlsx_structure(xlsx_path: str):
    """Analyze the structure of the XLSX file"""
    
    try:
        df = pd.read_excel(xlsx_path)
        
        logger.info(f"\nAnalyzing {xlsx_path}:")
        logger.info(f"  Shape: {df.shape}")
        logger.info(f"  Columns: {list(df.columns)}")
        logger.info(f"  Data types:\n{df.dtypes}")
        
        # Check for missing values
        missing_counts = df.isnull().sum()
        if missing_counts.any():
            logger.info(f"  Missing values:\n{missing_counts[missing_counts > 0]}")
        
        # Check coordinate ranges
        if 'XCoordinate' in df.columns and 'YCoordinate' in df.columns:
            logger.info(f"  X coordinate range: {df['XCoordinate'].min()} to {df['XCoordinate'].max()}")
            logger.info(f"  Y coordinate range: {df['YCoordinate'].min()} to {df['YCoordinate'].max()}")
        
        logger.info(f"  Sample data:")
        logger.info(df.head())
        
    except Exception as e:
        logger.error(f"Error analyzing XLSX file: {str(e)}")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Upload points from XLSX to PostgreSQL for TiPG')
    parser.add_argument('--xlsx', default='GEOSFM-cf-latlong.xlsx', 
                       help='Path to XLSX file (default: GEOSFM-cf-latlong.xlsx)')
    parser.add_argument('--table', default='geosfm_points',
                       help='Table name in PostgreSQL (default: geosfm_points)')
    parser.add_argument('--analyze-only', action='store_true',
                       help='Only analyze the file structure, do not upload')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.xlsx):
        logger.error(f"XLSX file not found: {args.xlsx}")
        logger.info("Please ensure the XLSX file exists")
        exit(1)
    
    # First analyze the XLSX file
    logger.info("=== Analyzing XLSX File ===")
    analyze_xlsx_structure(args.xlsx)
    
    if not args.analyze_only:
        # Upload points data
        logger.info("\n=== Uploading Points Data ===")
        if not DATABASE_URL:
            logger.error("DATABASE_URL environment variable not set")
            logger.info("Set DATABASE_URL environment variable or use --analyze-only to just analyze the file")
            exit(1)
            
        if upload_points_from_xlsx(args.xlsx, args.table):
            logger.info("Points data upload successful!")
        else:
            logger.error("Failed to upload points data")
            exit(1)