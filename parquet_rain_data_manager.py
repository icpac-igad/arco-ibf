"""
Parquet Rain Data Manager - Loads and manages time series rainfall data from GCS Parquet file
Provides efficient access to rainfall data by zone and date using the tidy format
"""

import os
import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
from google.cloud import storage
import pyarrow.parquet as pq
import io
import math

logger = logging.getLogger(__name__)


def safe_float_conversion(value):
    """
    Convert a value to a JSON-compliant float.
    Handles NaN, infinity, and other special float values.
    """
    try:
        # Convert to float first
        float_val = float(value)
        
        # Check for NaN, infinity, or other non-finite values
        if not math.isfinite(float_val):
            # Replace with 0.0 for NaN or infinity values
            return 0.0
        
        return float_val
    except (ValueError, TypeError, OverflowError):
        # If conversion fails, return 0.0
        return 0.0


class ParquetRainDataManager:
    """Manages rainfall time series data from GCS Parquet file in tidy format"""
    
    def __init__(self, 
                 bucket_name: str = "geosfm", 
                 parquet_file: str = "tidy_rainfall_data.parquet",
                 credentials_file: str = "coiled-data-e4drr_202505.json"):
        self.bucket_name = bucket_name
        self.parquet_file = parquet_file
        self.credentials_file = credentials_file
        self.rainfall_df: Optional[pd.DataFrame] = None
        self.loaded = False
        
        # Set up GCS credentials only if file exists
        if os.path.exists(credentials_file):
            os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = credentials_file
        else:
            logger.warning(f"Credentials file {credentials_file} not found, relying on environment credentials")
        
    def load_rainfall_data(self) -> bool:
        """Load rainfall data from GCS Parquet file"""
        
        try:
            logger.info(f"Loading rainfall data from gs://{self.bucket_name}/{self.parquet_file}")
            
            # Initialize GCS client
            client = storage.Client()
            bucket = client.bucket(self.bucket_name)
            blob = bucket.blob(self.parquet_file)
            
            # Download parquet file to memory
            parquet_bytes = blob.download_as_bytes()
            
            # Read parquet from bytes
            buffer = io.BytesIO(parquet_bytes)
            self.rainfall_df = pd.read_parquet(buffer)
            
            # Convert date column to datetime if not already
            if not pd.api.types.is_datetime64_any_dtype(self.rainfall_df['date']):
                self.rainfall_df['date'] = pd.to_datetime(self.rainfall_df['date'])
            
            # Sort for efficient access
            self.rainfall_df = self.rainfall_df.sort_values(['date', 'zone', 'gridcode']).reset_index(drop=True)
            
            logger.info(f"Loaded rainfall data: {len(self.rainfall_df)} records")
            logger.info(f"Date range: {self.rainfall_df['date'].min()} to {self.rainfall_df['date'].max()}")
            logger.info(f"Zones: {sorted(self.rainfall_df['zone'].unique())}")
            logger.info(f"Gridcodes: {len(self.rainfall_df['gridcode'].unique())} unique values")
            
            self.loaded = True
            return True
            
        except Exception as e:
            logger.error(f"Error loading rainfall data from GCS: {str(e)}")
            return False
    
    def _convert_date_to_yyyyddd(self, date_str: str) -> str:
        """Convert YYYY-MM-DD or datetime string to YYYYDDD format for compatibility"""
        try:
            if isinstance(date_str, str):
                if len(date_str) == 7 and date_str.isdigit():
                    # Already in YYYYDDD format
                    return date_str
                    
                # Parse as date
                dt = datetime.strptime(date_str, '%Y-%m-%d')
            else:
                dt = date_str
                
            # Convert to YYYYDDD format
            day_of_year = dt.timetuple().tm_yday
            return f"{dt.year}{day_of_year:03d}"
            
        except Exception:
            logger.warning(f"Could not convert date: {date_str}")
            return date_str
    
    def _convert_yyyyddd_to_date(self, yyyyddd: str) -> datetime:
        """Convert YYYYDDD format to datetime"""
        try:
            year = int(yyyyddd[:4])
            day_of_year = int(yyyyddd[4:])
            
            start_date = datetime(year, 1, 1)
            target_date = start_date + timedelta(days=day_of_year - 1)
            return target_date
            
        except Exception as e:
            logger.error(f"Error converting date {yyyyddd}: {e}")
            return None
    
    def get_rainfall_for_date(self, zone: str, date: str, gridcode: Optional[int] = None) -> Optional[Dict]:
        """
        Get rainfall data for a specific zone and date using ultra-efficient date-specific filtering
        
        Args:
            zone: Zone name (e.g., 'zone1', 'zone2') or zone number (1, 2, etc.)
            date: Date in YYYYDDD format or YYYY-MM-DD format
            gridcode: Optional specific gridcode to get data for
            
        Returns:
            Dictionary with rainfall data or None if not found
        """
        
        try:
            # Handle zone format - convert zone name to number
            if isinstance(zone, str) and zone.startswith('zone'):
                zone_num = int(zone.replace('zone', ''))
            else:
                try:
                    zone_num = int(zone)
                except:
                    logger.error(f"Invalid zone format: {zone}")
                    return None
            
            # Convert date format if needed
            if len(date) == 7 and date.isdigit():
                # YYYYDDD format - convert to datetime
                target_date = self._convert_yyyyddd_to_date(date)
                if target_date is None:
                    return None
            else:
                # Assume YYYY-MM-DD format
                try:
                    target_date = datetime.strptime(date, '%Y-%m-%d')
                except:
                    logger.error(f"Invalid date format: {date}")
                    return None
            
            # Use ultra-efficient PyArrow filtering to get only the specific date+zone data
            import pyarrow.parquet as pq
            import pyarrow.compute as pc
            
            # Initialize GCS client for direct reading
            client = storage.Client()
            bucket = client.bucket(self.bucket_name)
            blob = bucket.blob(self.parquet_file)
            
            # Download to memory buffer
            parquet_bytes = blob.download_as_bytes()
            buffer = io.BytesIO(parquet_bytes)
            
            # Read full table but only needed columns
            table = pq.read_table(buffer, columns=['zone', 'date', 'gridcode', 'rainfall_mm'])
            
            # Apply efficient filtering for specific zone and date
            filtered_table = table.filter(
                pc.and_(
                    pc.equal(table['zone'], zone_num),
                    pc.equal(table['date'], target_date)
                )
            )
            
            # If specific gridcode requested, add that filter
            if gridcode is not None:
                filtered_table = filtered_table.filter(
                    pc.equal(filtered_table['gridcode'], gridcode)
                )
            
            # Convert to pandas for processing
            filtered_data = filtered_table.to_pandas()
            
            if filtered_data.empty:
                logger.warning(f"No data found for zone {zone} on {date}")
                return None
            
            logger.info(f"Found {len(filtered_data)} rows for zone {zone} on {date}")
            
            if gridcode is not None:
                # Return data for specific gridcode
                row = filtered_data.iloc[0]
                return {
                    'zone': f"zone{zone_num}",
                    'date': date,
                    'gridcode': int(row['gridcode']),
                    'rainfall': safe_float_conversion(row['rainfall_mm'])
                }
            else:
                # Return all gridcode data for the date
                return {
                    'zone': f"zone{zone_num}",
                    'date': date,
                    'data': [
                        {
                            'gridcode': int(row['gridcode']),
                            'rainfall': safe_float_conversion(row['rainfall_mm'])
                        }
                        for _, row in filtered_data.iterrows()
                    ]
                }
                
        except Exception as e:
            logger.error(f"Error getting rainfall data with efficient filtering: {e}")
            # Fallback to full dataset loading only if absolutely necessary
            if not self.loaded:
                if not self.load_rainfall_data():
                    return None
            
            # Handle zone format - convert zone name to number
            if isinstance(zone, str) and zone.startswith('zone'):
                zone_num = int(zone.replace('zone', ''))
            else:
                try:
                    zone_num = int(zone)
                except:
                    logger.error(f"Invalid zone format: {zone}")
                    return None
            
            # Convert date format if needed
            if len(date) == 7 and date.isdigit():
                # YYYYDDD format - convert to datetime
                target_date = self._convert_yyyyddd_to_date(date)
                if target_date is None:
                    return None
            else:
                # Assume YYYY-MM-DD format
                try:
                    target_date = datetime.strptime(date, '%Y-%m-%d')
                except:
                    logger.error(f"Invalid date format: {date}")
                    return None
            
            # Filter data
            mask = (self.rainfall_df['zone'] == zone_num) & \
                   (self.rainfall_df['date'].dt.date == target_date.date())
            
            if gridcode is not None:
                mask = mask & (self.rainfall_df['gridcode'] == gridcode)
            
            filtered_data = self.rainfall_df[mask]
            
            if filtered_data.empty:
                logger.warning(f"No data found for zone {zone} on {date}")
                return None
            
            if gridcode is not None:
                # Return data for specific gridcode
                row = filtered_data.iloc[0]
                return {
                    'zone': f"zone{zone_num}",
                    'date': date,
                    'gridcode': int(row['gridcode']),
                    'rainfall': safe_float_conversion(row['rainfall_mm'])
                }
            else:
                # Return all gridcode data for the date
                return {
                    'zone': f"zone{zone_num}",
                    'date': date,
                    'data': [
                        {
                            'gridcode': int(row['gridcode']),
                            'rainfall': safe_float_conversion(row['rainfall_mm'])
                        }
                        for _, row in filtered_data.iterrows()
                    ]
                }
    
    def get_rainfall_timeseries(self, zone: str, gridcode: int, 
                                start_date: Optional[str] = None,
                                end_date: Optional[str] = None) -> Optional[List[Dict]]:
        """
        Get time series rainfall data for a specific gridcode
        
        Args:
            zone: Zone name or number
            gridcode: GRIDCODE to get data for
            start_date: Optional start date (YYYYDDD or YYYY-MM-DD format)
            end_date: Optional end date (YYYYDDD or YYYY-MM-DD format)
            
        Returns:
            List of rainfall data points or None if not found
        """
        
        if not self.loaded:
            if not self.load_rainfall_data():
                return None
        
        # Handle zone format
        if isinstance(zone, str) and zone.startswith('zone'):
            zone_num = int(zone.replace('zone', ''))
        else:
            try:
                zone_num = int(zone)
            except:
                logger.error(f"Invalid zone format: {zone}")
                return None
        
        # Filter by zone and gridcode
        mask = (self.rainfall_df['zone'] == zone_num) & \
               (self.rainfall_df['gridcode'] == gridcode)
        
        # Apply date filters if provided
        if start_date:
            if len(start_date) == 7 and start_date.isdigit():
                start_dt = self._convert_yyyyddd_to_date(start_date)
            else:
                start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            mask = mask & (self.rainfall_df['date'] >= start_dt)
        
        if end_date:
            if len(end_date) == 7 and end_date.isdigit():
                end_dt = self._convert_yyyyddd_to_date(end_date)
            else:
                end_dt = datetime.strptime(end_date, '%Y-%m-%d')
            mask = mask & (self.rainfall_df['date'] <= end_dt)
        
        filtered_data = self.rainfall_df[mask].sort_values('date')
        
        if filtered_data.empty:
            logger.warning(f"No timeseries data found for gridcode {gridcode} in zone {zone}")
            return None
        
        # Build timeseries with YYYYDDD format for compatibility
        timeseries = []
        for _, row in filtered_data.iterrows():
            date_yyyyddd = self._convert_date_to_yyyyddd(row['date'])
            timeseries.append({
                'date': date_yyyyddd,
                'rainfall': safe_float_conversion(row['rainfall_mm'])
            })
        
        return timeseries
    
    def get_zone_summary(self, zone: str, date: str) -> Optional[Dict]:
        """Get summary statistics for a zone on a specific date"""
        
        data = self.get_rainfall_for_date(zone, date)
        if not data or 'data' not in data:
            return None
        
        rainfall_values = [item['rainfall'] for item in data['data']]
        
        return {
            'zone': data['zone'],
            'date': date,
            'total_gridcodes': len(rainfall_values),
            'min_rainfall': safe_float_conversion(min(rainfall_values)),
            'max_rainfall': safe_float_conversion(max(rainfall_values)),
            'mean_rainfall': safe_float_conversion(np.mean(rainfall_values)),
            'total_rainfall': safe_float_conversion(sum(rainfall_values)),
            'gridcodes_with_rain': sum(1 for v in rainfall_values if v > 0)
        }
    
    def get_available_zones(self) -> List[str]:
        """Get list of available zones using minimal row-group reading (truly ultra memory efficient)"""
        try:
            # Use pyarrow for memory-efficient reading - read only until we find a complete date
            import pyarrow.parquet as pq
            
            # Initialize GCS client for direct reading
            client = storage.Client()
            bucket = client.bucket(self.bucket_name)
            blob = bucket.blob(self.parquet_file)
            
            # Download to memory buffer
            parquet_bytes = blob.download_as_bytes()
            buffer = io.BytesIO(parquet_bytes)
            
            # Strategy: Read row groups one by one until we find a complete date with all zones
            parquet_file = pq.ParquetFile(buffer)
            
            for i in range(min(3, parquet_file.num_row_groups)):  # Check max 3 row groups
                row_group = parquet_file.read_row_group(i, columns=['date', 'zone'])
                df = row_group.to_pandas()
                
                # Find the first date and get all zones for that date
                first_date = df['date'].iloc[0]
                single_date_data = df[df['date'] == first_date]
                
                # Check if we have a reasonable number of zones (complete date)
                if len(single_date_data) >= 100:  # Threshold for complete date
                    unique_zones = sorted(single_date_data['zone'].unique())
                    logger.info(f"Found {len(unique_zones)} zones from {len(single_date_data)} rows on {first_date} (row group {i})")
                    return [f"zone{z}" for z in unique_zones]
                
                # If not enough data, continue to next row group
                logger.info(f"Row group {i} has only {len(single_date_data)} rows for date {first_date}, trying next row group")
            
            # If we still don't have enough data, fall back to reading first row group entirely
            logger.warning("Could not find complete date in row groups, using first row group sample")
            first_row_group = parquet_file.read_row_group(0, columns=['zone'])
            df = first_row_group.to_pandas()
            unique_zones = sorted(df['zone'].unique())
            logger.info(f"Fallback: found {len(unique_zones)} zones from {len(df)} rows")
            return [f"zone{z}" for z in unique_zones]
            
        except Exception as e:
            logger.error(f"Error getting zones with minimal row-group reading: {e}")
            # Fallback to full dataset loading if minimal reading fails
            if not self.loaded:
                if not self.load_rainfall_data():
                    return []
            
            zones = sorted(self.rainfall_df['zone'].unique())
            return [f"zone{z}" for z in zones]
    
    def get_available_dates(self, zone: str, limit: int = 10) -> Optional[Dict]:
        """Get available dates for a zone using single gridcode (~5200 rows, ultra memory efficient)"""
        try:
            # Handle zone format
            if isinstance(zone, str) and zone.startswith('zone'):
                zone_num = int(zone.replace('zone', ''))
            else:
                try:
                    zone_num = int(zone)
                except:
                    logger.error(f"Invalid zone format: {zone}")
                    return None
            
            # Use pyarrow for memory-efficient reading - get dates from single gridcode
            import pyarrow.parquet as pq
            import pyarrow.compute as pc
            
            # Initialize GCS client
            client = storage.Client()
            bucket = client.bucket(self.bucket_name)
            blob = bucket.blob(self.parquet_file)
            
            # Download to memory buffer
            parquet_bytes = blob.download_as_bytes()
            buffer = io.BytesIO(parquet_bytes)
            
            # Strategy: Find any gridcode for this zone, then get all dates for that gridcode
            # Step 1: Get a sample to find a gridcode for this zone
            parquet_file = pq.ParquetFile(buffer)
            sample_table = parquet_file.read_row_group(0, columns=['zone', 'gridcode'])
            sample_df = sample_table.to_pandas()
            
            # Find any gridcode for the target zone
            zone_sample = sample_df[sample_df['zone'] == zone_num]
            if zone_sample.empty:
                logger.warning(f"No data found for zone {zone_num} in sample")
                return None
            
            target_gridcode = zone_sample['gridcode'].iloc[0]
            logger.info(f"Using gridcode {target_gridcode} from zone {zone_num} for dates lookup")
            
            # Step 2: Get all dates for this zone+gridcode combination
            buffer.seek(0)
            full_table = pq.read_table(buffer, columns=['zone', 'gridcode', 'date'])
            
            # Filter for target zone and gridcode
            filtered_table = full_table.filter(
                pc.and_(
                    pc.equal(full_table['zone'], zone_num),
                    pc.equal(full_table['gridcode'], target_gridcode)
                )
            )
            zone_gridcode_df = filtered_table.to_pandas()
            
            if zone_gridcode_df.empty:
                logger.warning(f"No dates found for zone {zone_num} gridcode {target_gridcode}")
                return None
            
            # Get unique dates and sort them
            unique_dates = sorted(zone_gridcode_df['date'].unique())
            sample_dates_list = unique_dates[:limit]
            
            # Convert to YYYYDDD format for compatibility
            sample_dates_yyyyddd = [self._convert_date_to_yyyyddd(dt) for dt in sample_dates_list]
            
            logger.info(f"Found {len(sample_dates_list)} dates for zone {zone_num} from {len(zone_gridcode_df)} rows")
            
            return {
                'zone': f"zone{zone_num}",
                'total_dates': len(unique_dates),
                'sample_dates': sample_dates_yyyyddd,
                'gridcode_used': int(target_gridcode)
            }
            
        except Exception as e:
            logger.error(f"Error getting dates with single-gridcode fetch: {e}")
            # Fallback to full dataset loading
            if not self.loaded:
                if not self.load_rainfall_data():
                    return None
            
            # Handle zone format
            if isinstance(zone, str) and zone.startswith('zone'):
                zone_num = int(zone.replace('zone', ''))
            else:
                try:
                    zone_num = int(zone)
                except:
                    logger.error(f"Invalid zone format: {zone}")
                    return None
            
            zone_data = self.rainfall_df[self.rainfall_df['zone'] == zone_num]
            if zone_data.empty:
                return None
            
            unique_dates = sorted(zone_data['date'].unique())
            sample_dates = unique_dates[:limit]
            
            # Convert to YYYYDDD format for compatibility
            sample_dates_yyyyddd = [self._convert_date_to_yyyyddd(dt) for dt in sample_dates]
            
            return {
                'zone': f"zone{zone_num}",
                'total_dates': len(unique_dates),
                'sample_dates': sample_dates_yyyyddd
            }
    
    def get_gridcodes_for_zone(self, zone: str) -> List[int]:
        """Get list of gridcodes available for a zone using single date (~500-1000 rows, ultra memory efficient)"""
        try:
            # Handle zone format
            if isinstance(zone, str) and zone.startswith('zone'):
                zone_num = int(zone.replace('zone', ''))
            else:
                try:
                    zone_num = int(zone)
                except:
                    return []
            
            # Use pyarrow for memory-efficient reading - get gridcodes from single recent date
            import pyarrow.parquet as pq
            import pyarrow.compute as pc
            
            # Initialize GCS client
            client = storage.Client()
            bucket = client.bucket(self.bucket_name)
            blob = bucket.blob(self.parquet_file)
            
            # Download to memory buffer
            parquet_bytes = blob.download_as_bytes()
            buffer = io.BytesIO(parquet_bytes)
            
            # Strategy: Find a recent date, then get all gridcodes for this zone on that date
            # Step 1: Get a recent date from sample
            parquet_file = pq.ParquetFile(buffer)
            sample_table = parquet_file.read_row_group(0, columns=['date'])
            sample_df = sample_table.to_pandas()
            
            # Get a recent date
            target_date = sample_df['date'].max()
            logger.info(f"Using date {target_date} for gridcodes lookup in zone {zone_num}")
            
            # Step 2: Get all gridcodes for this zone on this date
            buffer.seek(0)
            full_table = pq.read_table(buffer, columns=['zone', 'date', 'gridcode'])
            
            # Filter for target zone and date
            filtered_table = full_table.filter(
                pc.and_(
                    pc.equal(full_table['zone'], zone_num),
                    pc.equal(full_table['date'], target_date)
                )
            )
            zone_date_df = filtered_table.to_pandas()
            
            if zone_date_df.empty:
                logger.warning(f"No gridcodes found for zone {zone_num} on date {target_date}")
                return []
            
            # Get unique gridcodes
            gridcodes = sorted(zone_date_df['gridcode'].unique().tolist())
            
            logger.info(f"Found {len(gridcodes)} gridcodes for zone {zone_num} from {len(zone_date_df)} rows on {target_date}")
            return gridcodes
            
        except Exception as e:
            logger.error(f"Error getting gridcodes with single-date fetch: {e}")
            # Fallback to full dataset loading
            if not self.loaded:
                if not self.load_rainfall_data():
                    return []
            
            # Handle zone format
            if isinstance(zone, str) and zone.startswith('zone'):
                zone_num = int(zone.replace('zone', ''))
            else:
                try:
                    zone_num = int(zone)
                except:
                    return []
            
            zone_data = self.rainfall_df[self.rainfall_df['zone'] == zone_num]
            return sorted(zone_data['gridcode'].unique().tolist())

    def get_all_zones_rainfall_for_date(self, date: str) -> Optional[Dict]:
        """
        Get rainfall data for ALL zones on a specific date using ultra-efficient date filtering
        This is optimized for the collections endpoint to avoid memory overflow
        
        Args:
            date: Date in YYYYDDD format or YYYY-MM-DD format
            
        Returns:
            Dictionary with all zones' rainfall data or None if not found
        """
        
        try:
            # Convert date format if needed
            if len(date) == 7 and date.isdigit():
                # YYYYDDD format - convert to datetime
                target_date = self._convert_yyyyddd_to_date(date)
                if target_date is None:
                    return None
            else:
                # Assume YYYY-MM-DD format
                try:
                    target_date = datetime.strptime(date, '%Y-%m-%d')
                except:
                    logger.error(f"Invalid date format: {date}")
                    return None
            
            # Use ultra-efficient PyArrow filtering to get only the specific date data
            import pyarrow.parquet as pq
            import pyarrow.compute as pc
            
            # Initialize GCS client for direct reading
            client = storage.Client()
            bucket = client.bucket(self.bucket_name)
            blob = bucket.blob(self.parquet_file)
            
            # Download to memory buffer
            parquet_bytes = blob.download_as_bytes()
            buffer = io.BytesIO(parquet_bytes)
            
            # Use row-group based approach to avoid loading entire dataset
            parquet_file = pq.ParquetFile(buffer)
            
            # Read row groups one by one to find data for target date
            all_filtered_data = []
            
            # Sample first row group to check available dates
            sample_row_group = parquet_file.read_row_group(0, columns=['date'])
            sample_dates = sample_row_group.to_pandas()['date'].unique()
            logger.info(f"Sample dates in first row group: {sample_dates[:5]}...")
            
            for i in range(min(5, parquet_file.num_row_groups)):  # Limit to first 5 row groups for efficiency
                # Read one row group at a time
                row_group_table = parquet_file.read_row_group(i, columns=['zone', 'date', 'gridcode', 'rainfall_mm'])
                row_group_df = row_group_table.to_pandas()
                
                # Check if this row group contains our target date
                if target_date in row_group_df['date'].values:
                    # Filter for target date within this row group
                    date_filtered = row_group_df[row_group_df['date'] == target_date]
                    all_filtered_data.append(date_filtered)
                    
                    logger.info(f"Found {len(date_filtered)} rows for date {target_date} in row group {i}")
                    
                    # If we have data for all expected zones, we can stop
                    unique_zones = set()
                    for df in all_filtered_data:
                        unique_zones.update(df['zone'].unique())
                    
                    # If we have 6 zones (expected max), we can stop
                    if len(unique_zones) >= 6:
                        logger.info(f"Found all expected zones ({len(unique_zones)}), stopping row group iteration")
                        break
                else:
                    # Check what dates are in this row group for debugging
                    unique_dates = row_group_df['date'].unique()
                    logger.info(f"Row group {i} contains dates: {unique_dates[:3]}... (looking for {target_date})")
            
            if not all_filtered_data:
                logger.warning(f"No data found for date {target_date} in any row group")
                return None
            
            # Combine all filtered data
            import pandas as pd
            filtered_data = pd.concat(all_filtered_data, ignore_index=True)
            
            if filtered_data.empty:
                logger.warning(f"No data found for any zone on {date}")
                return None
            
            logger.info(f"Found {len(filtered_data)} total rows for all zones on {date}")
            
            # Group data by zone
            zones_data = {}
            zone_summaries = {}
            
            for zone_num in filtered_data['zone'].unique():
                zone_data = filtered_data[filtered_data['zone'] == zone_num]
                zone_name = f"zone{zone_num}"
                
                # Create gridcode to rainfall mapping for this zone
                gridcode_rainfall = {
                    int(row['gridcode']): safe_float_conversion(row['rainfall_mm'])
                    for _, row in zone_data.iterrows()
                }
                zones_data[zone_name] = gridcode_rainfall
                
                # Calculate summary for this zone
                rainfall_values = [safe_float_conversion(row['rainfall_mm']) for _, row in zone_data.iterrows()]
                zone_summaries[zone_name] = {
                    'zone': zone_name,
                    'date': date,
                    'total_gridcodes': len(rainfall_values),
                    'min_rainfall': safe_float_conversion(min(rainfall_values)),
                    'max_rainfall': safe_float_conversion(max(rainfall_values)),
                    'mean_rainfall': safe_float_conversion(sum(rainfall_values) / len(rainfall_values)),
                    'total_rainfall': safe_float_conversion(sum(rainfall_values)),
                    'gridcodes_with_rain': sum(1 for v in rainfall_values if v > 0)
                }
            
            return {
                'date': date,
                'zones_data': zones_data,
                'zone_summaries': zone_summaries,
                'total_zones': len(zones_data),
                'total_rows_processed': len(filtered_data)
            }
                
        except Exception as e:
            logger.error(f"Error getting all zones rainfall data with efficient filtering: {e}")
            return None


# Singleton instance
parquet_rain_data_manager = ParquetRainDataManager()