#!/usr/bin/env python
"""
Ultra memory-efficient East Africa stream processing.
Uses minimal memory by processing in small chunks and immediately writing results.
"""

import os
import time
import gc
from pathlib import Path
import logging

import geopandas as gpd
import pandas as pd
import pyogrio

# Set up logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class MinimalEAProcessor:
    """Ultra-lightweight processor with minimal memory footprint."""

    def __init__(self, data_dir="data_temp"):
        self.project_dir = Path.cwd()
        self.data_dir = self.project_dir / data_dir
        self.geoglows_dir = self.data_dir / 'geoglows-v2'
        self.processed_dir = self.geoglows_dir / 'processed'
        
        # EA boundary file path
        self.ea_boundary_path = self.project_dir.parent / 'ea_ghcf_simple.json'
        
        # East Africa VPU numbers
        self.east_africa_vpus = [101, 102, 103, 106, 109, 120, 122, 126]
        
        # Create directories
        for directory in [self.data_dir, self.geoglows_dir, self.processed_dir]:
            directory.mkdir(parents=True, exist_ok=True)

        logger.info(f"Initialized minimal processor")

    def load_boundary_geometry(self):
        """Load just the boundary geometry."""
        logger.info("Loading EA boundary geometry...")
        
        boundary_gdf = gpd.read_file(self.ea_boundary_path)
        dissolved = boundary_gdf.dissolve()
        
        if dissolved.crs != 'EPSG:4326':
            dissolved = dissolved.to_crs('EPSG:4326')
        
        boundary_geom = dissolved.geometry.iloc[0]
        
        # Clean up
        del boundary_gdf, dissolved
        gc.collect()
        
        return boundary_geom

    def process_vpu_minimal(self, vpu_number, boundary_geom):
        """Process VPU with absolute minimal memory usage."""
        vpu_file = self.geoglows_dir / f'streams_{vpu_number}.gpkg'
        output_file = self.geoglows_dir / f'east_africa_streams_{vpu_number}.gpkg'
        
        if output_file.exists():
            logger.info(f"VPU {vpu_number}: Already processed")
            return True
        
        if not vpu_file.exists():
            logger.warning(f"VPU {vpu_number}: File not found")
            return False
        
        logger.info(f"VPU {vpu_number}: Starting minimal processing...")
        
        try:
            # Get file info without loading
            info = pyogrio.read_info(str(vpu_file))
            total_features = info['features']
            logger.info(f"VPU {vpu_number}: {total_features} total features")
            
            # Process in chunks to avoid memory issues
            chunk_size = 10000  # Small chunks
            processed_count = 0
            ea_features = []
            
            for offset in range(0, total_features, chunk_size):
                current_chunk_size = min(chunk_size, total_features - offset)
                logger.info(f"VPU {vpu_number}: Processing chunk {offset//chunk_size + 1} "
                           f"({offset+1}-{offset+current_chunk_size} of {total_features})")
                
                # Load chunk
                try:
                    chunk_gdf = pyogrio.read_dataframe(
                        str(vpu_file),
                        read_geometry=True,
                        max_features=current_chunk_size,
                        skip_features=offset,
                        use_arrow=True
                    )
                    
                    if len(chunk_gdf) == 0:
                        break
                    
                    # Convert CRS if needed
                    if chunk_gdf.crs != 'EPSG:4326':
                        chunk_gdf = chunk_gdf.to_crs('EPSG:4326')
                    
                    # Quick spatial filter
                    intersects_mask = chunk_gdf.geometry.intersects(boundary_geom)
                    ea_chunk = chunk_gdf[intersects_mask]
                    
                    if len(ea_chunk) > 0:
                        ea_features.append(ea_chunk)
                        processed_count += len(ea_chunk)
                        logger.info(f"VPU {vpu_number}: Found {len(ea_chunk)} EA features in chunk")
                    
                    # Force cleanup
                    del chunk_gdf, ea_chunk
                    gc.collect()
                    
                except Exception as e:
                    logger.warning(f"VPU {vpu_number}: Error in chunk {offset//chunk_size + 1}: {e}")
                    continue
            
            # Save results if any found
            if ea_features and processed_count > 0:
                logger.info(f"VPU {vpu_number}: Combining {len(ea_features)} chunks with {processed_count} total features")
                
                # Combine chunks
                combined_gdf = pd.concat(ea_features, ignore_index=True)
                
                # Basic optimization
                if 'LINKNO' in combined_gdf.columns:
                    combined_gdf['LINKNO'] = combined_gdf['LINKNO'].astype('int32')
                if 'strmOrder' in combined_gdf.columns:
                    combined_gdf['strmOrder'] = combined_gdf['strmOrder'].astype('int8')
                
                # Save
                combined_gdf.to_file(output_file, driver='GPKG', engine='pyogrio')
                file_size = output_file.stat().st_size / 1024 / 1024
                
                logger.info(f"VPU {vpu_number}: Saved {len(combined_gdf)} features ({file_size:.1f} MB)")
                
                # Cleanup
                del combined_gdf, ea_features
                gc.collect()
                
                return True
            else:
                logger.info(f"VPU {vpu_number}: No EA features found")
                return False
                
        except Exception as e:
            logger.error(f"VPU {vpu_number}: Failed - {e}")
            return False

    def merge_subsets_minimal(self):
        """Merge subset files with minimal memory usage."""
        logger.info("Merging EA subsets...")
        
        ea_files = list(self.geoglows_dir.glob('east_africa_streams_*.gpkg'))
        
        if not ea_files:
            logger.error("No subset files found")
            return False
        
        logger.info(f"Found {len(ea_files)} subset files")
        
        # Output paths
        final_gpkg = self.processed_dir / "east_africa_streams_final.gpkg"
        final_parquet = self.processed_dir / "east_africa_streams_final.parquet"
        
        # Process files one by one and write to final output
        all_parts = []
        total_features = 0
        
        for i, ea_file in enumerate(sorted(ea_files)):
            logger.info(f"Loading subset {i+1}/{len(ea_files)}: {ea_file.name}")
            
            try:
                subset_gdf = gpd.read_file(ea_file)
                all_parts.append(subset_gdf)
                total_features += len(subset_gdf)
                logger.info(f"  Loaded {len(subset_gdf)} features")
                
            except Exception as e:
                logger.warning(f"  Failed: {e}")
        
        if not all_parts:
            logger.error("No subsets could be loaded")
            return False
        
        # Merge and save
        logger.info(f"Merging {total_features} total features...")
        merged_gdf = pd.concat(all_parts, ignore_index=True)
        
        # Save as GeoPackage
        logger.info("Saving final GeoPackage...")
        merged_gdf.to_file(final_gpkg, driver='GPKG', engine='pyogrio')
        gpkg_size = final_gpkg.stat().st_size / 1024 / 1024
        
        # Save as Parquet
        logger.info("Saving final Parquet...")
        merged_gdf.to_parquet(final_parquet, compression='brotli')
        parquet_size = final_parquet.stat().st_size / 1024 / 1024
        
        logger.info(f"Final outputs created:")
        logger.info(f"  GeoPackage: {gpkg_size:.1f} MB")
        logger.info(f"  Parquet: {parquet_size:.1f} MB")
        logger.info(f"  Total features: {len(merged_gdf)}")
        
        # Stream order distribution
        if 'strmOrder' in merged_gdf.columns:
            order_counts = merged_gdf['strmOrder'].value_counts().sort_index()
            logger.info("Stream order distribution:")
            for order, count in order_counts.items():
                logger.info(f"  Order {order}: {count:,} streams")
        
        return True

    def run_minimal_pipeline(self):
        """Run the minimal memory pipeline."""
        logger.info("Starting minimal EA processing pipeline...")
        
        try:
            # Load boundary
            boundary_geom = self.load_boundary_geometry()
            
            # Process each VPU
            success_count = 0
            for vpu in self.east_africa_vpus:
                if self.process_vpu_minimal(vpu, boundary_geom):
                    success_count += 1
            
            logger.info(f"Successfully processed {success_count}/{len(self.east_africa_vpus)} VPUs")
            
            if success_count == 0:
                logger.error("No VPUs processed successfully")
                return False
            
            # Merge results
            return self.merge_subsets_minimal()
            
        except Exception as e:
            logger.error(f"Pipeline failed: {e}")
            return False


def main():
    """Main function."""
    logger.info("Starting minimal EA stream processing...")
    
    processor = MinimalEAProcessor()
    
    if processor.run_minimal_pipeline():
        print("\n" + "=" * 50)
        print("MINIMAL PROCESSING COMPLETE!")
        print("=" * 50)
        print(f"Output directory: {processor.processed_dir}")
        print("Files created:")
        print("  - east_africa_streams_final.gpkg")
        print("  - east_africa_streams_final.parquet")
        return 0
    else:
        print("Processing failed")
        return 1


if __name__ == "__main__":
    exit(main())