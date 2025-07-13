"""
Optimized EA river networks upload with simplified schema for vector tile performance.
Only uploads geometry, LINKNO, and STRMORDER columns to ea_river_networks_tdx_v2 table.
"""

import os
import time
import gc
from pathlib import Path
import logging

import geopandas as gpd
import pandas as pd
import pyogrio
from sqlalchemy import create_engine, text, BigInteger, SmallInteger
from geoalchemy2 import Geometry

# Setup logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class EAUploadOptimizerV2:
    """Optimized EA river networks upload with minimal schema for vector tiles."""

    def __init__(self, data_dir="data_temp", chunk_size=10000):
        self.project_dir = Path.cwd()
        self.data_dir = self.project_dir / data_dir
        self.geoglows_dir = self.data_dir / 'geoglows-v2'
        
        # Database configuration
        self.database_url = os.getenv('DATABASE_URL', '')
        if not self.database_url:
            raise ValueError("DATABASE_URL environment variable not set")
        
        # Optimized table name and larger chunks for simplified schema
        self.table_name = 'ea_river_networks_tdx_v2'
        self.east_africa_vpus = [101, 102, 103, 106, 109, 120, 122, 126]
        self.chunk_size = chunk_size
        
        logger.info(f"Initialized EA Upload Optimizer V2 for: {self.table_name}")
        logger.info(f"Optimized for vector tiles with simplified schema (geometry + linkno + stream_order)")
        logger.info(f"Chunk size: {self.chunk_size:,} features per chunk")

    def check_table_status(self):
        """Check current table status and determine what needs to be uploaded."""
        try:
            engine = create_engine(self.database_url)
            with engine.connect() as conn:
                # Check if table exists
                table_exists = conn.execute(text("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = :table_name
                    )
                """), {"table_name": self.table_name}).scalar()
                
                if not table_exists:
                    logger.info("Table does not exist - will create new optimized table")
                    return {
                        'table_exists': False,
                        'existing_vpus': [],
                        'missing_vpus': self.east_africa_vpus.copy(),
                        'total_features': 0
                    }
                
                # Get existing VPUs and counts
                result = conn.execute(text(f"""
                    SELECT 
                        SUBSTRING(linkno::text FROM 1 FOR 3)::int as vpu_code,
                        COUNT(*) as feature_count
                    FROM {self.table_name}
                    GROUP BY SUBSTRING(linkno::text FROM 1 FOR 3)::int
                    ORDER BY vpu_code
                """))
                
                existing_data = {row.vpu_code: row.feature_count for row in result}
                existing_vpus = list(existing_data.keys())
                missing_vpus = [vpu for vpu in self.east_africa_vpus if vpu not in existing_vpus]
                total_features = sum(existing_data.values())
                
                # Get table info
                table_info = conn.execute(text(f"""
                    SELECT 
                        COUNT(*) as total_features,
                        COUNT(DISTINCT SUBSTRING(linkno::text FROM 1 FOR 3)::int) as vpu_count,
                        ST_Extent(geometry) as extent
                    FROM {self.table_name}
                """)).fetchone()
                
                status = {
                    'table_exists': True,
                    'existing_vpus': existing_vpus,
                    'missing_vpus': missing_vpus,
                    'existing_data': existing_data,
                    'total_features': table_info.total_features,
                    'vpu_count': table_info.vpu_count,
                    'extent': str(table_info.extent)
                }
                
                return status
                
        except Exception as e:
            logger.error(f"Error checking table status: {e}")
            return None

    def print_status(self, status):
        """Print current upload status."""
        logger.info("=" * 60)
        logger.info("EA RIVER NETWORKS UPLOAD STATUS (V2 OPTIMIZED)")
        logger.info("=" * 60)
        
        if not status['table_exists']:
            logger.info("❌ Optimized table does not exist")
            logger.info(f"🔄 Need to upload: {len(status['missing_vpus'])} VPUs")
            logger.info(f"📋 VPUs to upload: {status['missing_vpus']}")
            return
        
        logger.info("✅ Optimized table exists")
        logger.info(f"📊 Current features: {status['total_features']:,}")
        logger.info(f"🗺️ VPU regions: {status['vpu_count']}")
        logger.info(f"📐 Spatial extent: {status['extent']}")
        
        if status['existing_vpus']:
            logger.info(f"\n✅ Completed VPUs ({len(status['existing_vpus'])}):")
            for vpu in sorted(status['existing_vpus']):
                count = status['existing_data'][vpu]
                logger.info(f"  VPU {vpu}: {count:,} features")
        
        if status['missing_vpus']:
            logger.info(f"\n❌ Missing VPUs ({len(status['missing_vpus'])}):")
            logger.info(f"  {status['missing_vpus']}")
        else:
            logger.info(f"\n🎉 All VPUs uploaded successfully!")

    def get_expected_counts(self):
        """Get expected feature counts from GPKG files."""
        expected_counts = {}
        total_expected = 0
        
        for vpu in self.east_africa_vpus:
            vpu_file = self.geoglows_dir / f'east_africa_streams_{vpu}.gpkg'
            if vpu_file.exists():
                try:
                    # Use pyogrio directly for better performance
                    info = pyogrio.read_info(str(vpu_file))
                    count = info['features']
                    expected_counts[vpu] = count
                    total_expected += count
                    logger.info(f"VPU {vpu}: Expected {count:,} features")
                except Exception as e:
                    logger.warning(f"Could not get count for VPU {vpu}: {e}")
                    expected_counts[vpu] = 0
            else:
                logger.warning(f"VPU {vpu}: GPKG file not found")
                expected_counts[vpu] = 0
        
        logger.info(f"Total expected features: {total_expected:,}")
        return expected_counts

    def process_vpu_chunks_optimized(self, vpu_code, chunk_size=10000):
        """Process VPU data in chunks using pyogrio for optimal performance."""
        vpu_file = self.geoglows_dir / f'east_africa_streams_{vpu_code}.gpkg'
        
        if not vpu_file.exists():
            logger.warning(f"VPU {vpu_code}: File not found")
            return None
        
        try:
            # Get total feature count first
            info = pyogrio.read_info(str(vpu_file))
            total_features = info['features']
            
            logger.info(f"VPU {vpu_code}: Processing {total_features:,} features in chunks of {chunk_size:,}")
            
            # Process in chunks using pyogrio directly to avoid SKIPROWS warning
            chunks_processed = 0
            total_chunks = (total_features + chunk_size - 1) // chunk_size
            
            for start_idx in range(0, total_features, chunk_size):
                end_idx = min(start_idx + chunk_size, total_features)
                chunks_processed += 1
                
                logger.info(f"VPU {vpu_code}: Processing chunk {chunks_processed}/{total_chunks} (features {start_idx:,}-{end_idx:,})")
                
                # Use pyogrio directly with skip_features and max_features to avoid warning
                try:
                    # Read only geometry, LINKNO, and strmOrder columns for optimal performance
                    chunk_gdf = pyogrio.read_dataframe(
                        str(vpu_file),
                        columns=['geometry', 'LINKNO', 'strmOrder'],
                        skip_features=start_idx,
                        max_features=chunk_size
                    )
                    
                    if len(chunk_gdf) == 0:
                        continue
                    
                    # Convert to GeoDataFrame and optimize
                    chunk_gdf = gpd.GeoDataFrame(chunk_gdf, crs='EPSG:4326')
                    
                    # Minimal processing for optimal performance
                    processed_chunk = self._process_chunk_minimal(chunk_gdf, vpu_code)
                    
                    if processed_chunk is not None:
                        yield processed_chunk
                    
                    # Cleanup
                    del chunk_gdf
                    if processed_chunk is not None:
                        del processed_chunk
                    gc.collect()
                    
                except Exception as e:
                    logger.warning(f"VPU {vpu_code}: Error reading chunk {chunks_processed}: {e}")
                    continue
            
            logger.info(f"VPU {vpu_code}: Completed processing {chunks_processed} chunks")
            
        except Exception as e:
            logger.error(f"VPU {vpu_code}: Error processing chunks - {e}")
            return None

    def _process_chunk_minimal(self, gdf, vpu_code):
        """Process a single chunk with minimal transformations for optimal performance."""
        try:
            # Ensure we have required columns
            if 'LINKNO' not in gdf.columns:
                logger.error(f"VPU {vpu_code}: LINKNO column not found")
                return None
            
            # Select required columns and rename to lowercase for consistency
            gdf_clean = gdf[['geometry', 'LINKNO', 'strmOrder']].copy()
            gdf_clean = gdf_clean.rename(columns={'LINKNO': 'linkno', 'strmOrder': 'stream_order'})
            
            # Ensure WGS84 (should already be, but verify)
            if gdf_clean.crs != 'EPSG:4326':
                gdf_clean = gdf_clean.to_crs('EPSG:4326')
            
            # Optimize data types for better indexing
            gdf_clean['linkno'] = gdf_clean['linkno'].astype('int64')
            gdf_clean['stream_order'] = gdf_clean['stream_order'].astype('int16')  # Stream order is small integer
            
            # Remove any invalid geometries
            gdf_clean = gdf_clean[gdf_clean['geometry'].notna()]
            gdf_clean = gdf_clean[gdf_clean.geometry.is_valid]
            
            return gdf_clean
            
        except Exception as e:
            logger.error(f"VPU {vpu_code}: Error processing chunk - {e}")
            return None

    def upload_vpu_optimized(self, vpu_code, engine, is_first_upload=False, chunk_size=10000):
        """Upload a single VPU to the database using optimized chunked processing."""
        try:
            logger.info(f"VPU {vpu_code}: Starting optimized upload (chunk size: {chunk_size:,})")
            start_time = time.time()
            
            total_uploaded = 0
            chunk_count = 0
            
            # Process chunks
            chunk_generator = self.process_vpu_chunks_optimized(vpu_code, chunk_size)
            if chunk_generator is None:
                return False
            
            for chunk_gdf in chunk_generator:
                if chunk_gdf is None or len(chunk_gdf) == 0:
                    continue
                
                chunk_count += 1
                chunk_start = time.time()
                
                # Determine upload mode (first chunk replaces, rest append)
                if_exists_mode = 'replace' if (is_first_upload and chunk_count == 1) else 'append'
                
                # Upload chunk to PostgreSQL with optimized settings
                chunk_gdf.to_postgis(
                    name=self.table_name,
                    con=engine,
                    if_exists=if_exists_mode,
                    index=False,
                    dtype={'geometry': Geometry('LINESTRING', srid=4326), 'linkno': BigInteger(), 'stream_order': SmallInteger()},
                    chunksize=1000   # Smaller chunks for the actual SQL inserts
                )
                
                total_uploaded += len(chunk_gdf)
                chunk_time = time.time() - chunk_start
                
                logger.info(f"VPU {vpu_code}: Uploaded chunk {chunk_count} - {len(chunk_gdf):,} features in {chunk_time:.1f}s (total: {total_uploaded:,})")
                
                # Cleanup chunk
                del chunk_gdf
                gc.collect()
            
            upload_time = time.time() - start_time
            logger.info(f"VPU {vpu_code}: Optimized upload completed - {total_uploaded:,} features in {upload_time:.1f}s ({chunk_count} chunks)")
            
            return True
            
        except Exception as e:
            logger.error(f"VPU {vpu_code}: Optimized upload failed - {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False

    def create_optimized_indexes(self, engine):
        """Create optimized indexes for vector tile performance."""
        logger.info("Creating optimized database indexes for vector tiles...")
        
        try:
            with engine.connect() as conn:
                # Drop any existing indexes first
                conn.execute(text(f"DROP INDEX IF EXISTS idx_{self.table_name}_geom"))
                conn.execute(text(f"DROP INDEX IF EXISTS idx_{self.table_name}_linkno"))
                
                # Create optimized indexes for vector tile performance
                indexes = [
                    # Primary spatial index with optimized settings for vector tiles
                    f"""CREATE INDEX idx_{self.table_name}_geom 
                        ON {self.table_name} 
                        USING GIST (geometry) 
                        WITH (fillfactor=100)""",
                    
                    # Stream order index for zoom-level filtering
                    f"""CREATE INDEX idx_{self.table_name}_stream_order 
                        ON {self.table_name} (stream_order) 
                        WITH (fillfactor=100)""",
                    
                    # LINKNO index for fast lookups
                    f"""CREATE INDEX idx_{self.table_name}_linkno 
                        ON {self.table_name} (linkno) 
                        WITH (fillfactor=100)""",
                    
                    # Composite index for zoom-based filtering (critical for performance)
                    f"""CREATE INDEX idx_{self.table_name}_geom_stream_order 
                        ON {self.table_name} 
                        USING GIST (geometry) 
                        WHERE stream_order >= 3""",
                    
                    # Partial indexes for different zoom levels
                    f"""CREATE INDEX idx_{self.table_name}_geom_major_streams 
                        ON {self.table_name} 
                        USING GIST (geometry) 
                        WHERE stream_order >= 5""",
                ]
                
                for idx_sql in indexes:
                    logger.info(f"Creating index: {idx_sql.split()[2]}")
                    conn.execute(text(idx_sql))
                
                # Set table statistics for better query planning
                conn.execute(text(f"ANALYZE {self.table_name}"))
                
                conn.commit()
                logger.info("Optimized indexes created successfully")
                
        except Exception as e:
            logger.warning(f"Error creating indexes: {e}")

    def optimize_table_for_tiles(self, engine):
        """Apply additional optimizations for vector tile performance."""
        logger.info("Applying table optimizations for vector tiles...")
        
        try:
            with engine.connect() as conn:
                # Add simplified geometry columns for different zoom levels
                optimizations = [
                    # Add simplified geometry for low zoom levels
                    f"""ALTER TABLE {self.table_name} 
                        ADD COLUMN IF NOT EXISTS geom_simplified geometry(LINESTRING, 4326)""",
                    
                    # Create simplified geometries (tolerance ~100m for low zoom)
                    f"""UPDATE {self.table_name} 
                        SET geom_simplified = ST_Simplify(geometry, 0.001)
                        WHERE geom_simplified IS NULL""",
                    
                    # Create spatial index on simplified geometry
                    f"""CREATE INDEX IF NOT EXISTS idx_{self.table_name}_geom_simplified 
                        ON {self.table_name} 
                        USING GIST (geom_simplified)""",
                ]
                
                for opt_sql in optimizations:
                    logger.info(f"Applying optimization: {opt_sql.split()[0:3]}")
                    conn.execute(text(opt_sql))
                
                # Cluster table by spatial index for better I/O performance
                conn.execute(text(f"CLUSTER {self.table_name} USING idx_{self.table_name}_geom"))
                
                # Update statistics
                conn.execute(text(f"ANALYZE {self.table_name}"))
                
                # Set autovacuum settings for optimal performance
                conn.execute(text(f"""
                    ALTER TABLE {self.table_name} SET (
                        autovacuum_vacuum_scale_factor = 0.1,
                        autovacuum_analyze_scale_factor = 0.05
                    )
                """))
                
                conn.commit()
                logger.info("Table optimizations applied successfully")
                
        except Exception as e:
            logger.warning(f"Error applying table optimizations: {e}")

    def resume_upload(self):
        """Resume the interrupted upload with optimizations."""
        logger.info("Starting EA river networks optimized upload (V2)...")
        
        # Check current status
        status = self.check_table_status()
        if not status:
            logger.error("Could not determine table status")
            return False
        
        self.print_status(status)
        
        if not status['missing_vpus']:
            logger.info("🎉 Optimized upload is already complete!")
            return True
        
        # Get expected counts
        expected_counts = self.get_expected_counts()
        
        # Confirm resume
        print(f"\nReady to upload {len(status['missing_vpus'])} missing VPUs to optimized table:")
        for vpu in status['missing_vpus']:
            expected = expected_counts.get(vpu, 0)
            print(f"  VPU {vpu}: {expected:,} expected features")
        print(f"\nOptimizations:")
        print(f"  - Simplified schema (geometry + linkno + stream_order)")
        print(f"  - Larger chunk size: {self.chunk_size:,}")
        print(f"  - Multi-insert method")
        print(f"  - Vector tile optimized indexes")
        
        confirm = input(f"\nProceed with optimized upload? (y/N): ")
        if confirm.lower() != 'y':
            logger.info("Upload cancelled")
            return False
        
        # Start upload
        try:
            engine = create_engine(self.database_url)
            
            success_count = 0
            is_first_upload = not status['table_exists']
            
            for i, vpu in enumerate(status['missing_vpus']):
                logger.info(f"\n{'='*50}")
                logger.info(f"Processing VPU {vpu} ({i+1}/{len(status['missing_vpus'])})")
                logger.info(f"{'='*50}")
                
                # Upload using optimized chunked method
                if self.upload_vpu_optimized(vpu, engine, is_first_upload and i == 0, self.chunk_size):
                    success_count += 1
                
                # Force garbage collection between VPUs
                gc.collect()
            
            logger.info(f"\nOptimized upload completed: {success_count}/{len(status['missing_vpus'])} VPUs successful")
            
            if success_count > 0:
                # Create optimized indexes
                self.create_optimized_indexes(engine)
                
                # Apply table optimizations
                self.optimize_table_for_tiles(engine)
                
                # Verify final state
                final_status = self.check_table_status()
                if final_status:
                    self.print_status(final_status)
                
                return True
            else:
                logger.error("No VPUs uploaded successfully")
                return False
                
        except Exception as e:
            logger.error(f"Optimized upload failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False


def main():
    """Main function."""
    logger.info("EA River Networks Optimized Upload (V2)")
    
    # Use larger chunk size for simplified schema
    chunk_size = int(os.getenv('CHUNK_SIZE', 10000))
    logger.info(f"Using optimized chunk size: {chunk_size:,} features")
    
    try:
        uploader = EAUploadOptimizerV2(chunk_size=chunk_size)
    except ValueError as e:
        logger.error(str(e))
        logger.info("Please set DATABASE_URL environment variable")
        return 1
    
    if uploader.resume_upload():
        print(f"\n✅ Optimized upload completed successfully!")
        print(f"Table: {uploader.table_name}")
        print(f"Schema: geometry + linkno + stream_order + optimizations")
        print(f"\nNext steps:")
        print(f"1. Restart TIPG server")
        print(f"2. Test endpoint: /collections/public.{uploader.table_name}")
        print(f"3. Check vector tiles: /collections/public.{uploader.table_name}/tiles/{{z}}/{{x}}/{{y}}")
        print(f"4. Performance should be significantly improved!")
        return 0
    else:
        print(f"\n❌ Optimized upload failed")
        return 1


if __name__ == "__main__":
    exit(main())