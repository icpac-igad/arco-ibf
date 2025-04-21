"""
IMERG Data Processing Script: Download, Convert to COG, and Upload to GCS

This script performs the following tasks:
1. Downloads IMERG satellite data for specified date(s)
2. Subsets data to East Africa region
3. Converts to Cloud Optimized GeoTIFF (COG) format
4. Uploads processed files to Google Cloud Storage
"""

import os
import argparse
from datetime import datetime, timedelta
import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.warp import calculate_default_transform, reproject, Resampling
import rioxarray
import xarray as xr
import pandas as pd
import geopandas as gpd
from dotenv import load_dotenv
import requests
from requests.auth import HTTPBasicAuth
import re
from pathlib import Path
import tempfile
from rio_cogeo.cogeo import cog_translate
from rio_cogeo.profiles import cog_profiles
from google.cloud import storage
from google.oauth2 import service_account
import logging
from bs4 import BeautifulSoup
from urllib.parse import urljoin

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Default to yesterday if date is not provided
yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y%m%d')

# Define East Africa extent from environment variables
EXTENT = [
    float(os.getenv('EXTENT_X1', '21.85')),  # min longitude
    float(os.getenv('EXTENT_X2', '51.50')),  # max longitude
    float(os.getenv('EXTENT_Y1', '-11.72')), # min latitude
    float(os.getenv('EXTENT_Y2', '23.14'))   # max latitude
]

# Log the extent values being used
logger.info(f"Using extent: [lon_min={EXTENT[0]}, lon_max={EXTENT[1]}, lat_min={EXTENT[2]}, lat_max={EXTENT[3]}]")

def list_imerg_files_by_date(url, file_filter, username, password, start_date, end_date=None):
    """
    List IMERG GIS files available for download within a date range
    
    Args:
        url: Base URL for IMERG GIS data
        file_filter: String to filter filenames
        username: NASA Earthdata username
        password: NASA Earthdata password
        start_date: Start date in YYYYMMDD format
        end_date: End date in YYYYMMDD format (optional, defaults to start_date)
    
    Returns:
        List of file URLs matching the date range
    """
    if not end_date:
        end_date = start_date
    
    # Convert dates to datetime objects
    start_dt = datetime.strptime(start_date, '%Y%m%d')
    end_dt = datetime.strptime(end_date, '%Y%m%d')
    
    logger.info(f"Finding IMERG files from {start_date} to {end_date}")
    
    # Generate list of months to check (NASA organizes by year/month, not day)
    months_to_check = set()
    current_dt = start_dt
    while current_dt <= end_dt:
        year_month = current_dt.strftime('%Y/%m')
        months_to_check.add(year_month)
        # Move to next day
        current_dt += timedelta(days=1)
    
    logger.info(f"Checking {len(months_to_check)} month(s) in the date range")
    
    # Find files for each month
    file_urls = []
    for year_month in months_to_check:
        # Construct directory URL
        dir_url = f"{url}/{year_month}/"
        
        # List files in directory
        try:
            logger.info(f"Checking directory: {dir_url}")
            response = requests.get(dir_url, auth=HTTPBasicAuth(username, password))
            response.raise_for_status()
            
            # Use BeautifulSoup for more robust HTML parsing
            soup = BeautifulSoup(response.text, 'html.parser')
            links = soup.find_all('a')
            
            found_files_count = 0
            
            # Filter files by date range and file filter
            for link in links:
                href = link.get('href')
                if href and file_filter in href:
                    # Extract date from filename - the pattern is now 3IMERG.YYYYMMDD in the filename
                    date_match = re.search(r'3IMERG\.(\d{8})', href)
                    if not date_match:
                        # Try alternative pattern: may be 3IMERG.YYYYMMDD-S...
                        date_match = re.search(r'3IMERG\.(\d{8})-', href)
                    
                    if not date_match:
                        # Try one more pattern
                        date_match = re.search(r'3IMERG\.(\d{8})\.', href)
                    
                    if not date_match:
                        # One final attempt with the format shown in your screenshot
                        date_match = re.search(r'3IMERG\.(\d{8})', href)
                    
                    if date_match:
                        file_date_str = date_match.group(1)
                        try:
                            file_date = datetime.strptime(file_date_str, '%Y%m%d')
                            
                            # Check if the file date is within our range
                            if start_dt <= file_date <= end_dt:
                                full_url = urljoin(dir_url, href)
                                file_urls.append(full_url)
                                found_files_count += 1
                                logger.debug(f"Matched file: {href}")
                        except ValueError:
                            logger.warning(f"Invalid date format in filename: {href}")
            
            logger.info(f"Found {found_files_count} files for {year_month} within date range")
            
        except requests.RequestException as e:
            logger.error(f"Error listing files for {year_month}: {e}")
    
    logger.info(f"Total files found across all months: {len(file_urls)}")
    
    # Log a sample of found URLs to help with debugging
    if file_urls:
        logger.info(f"Sample URL: {file_urls[0]}")
    
    return file_urls

def check_file_exists(output_dir, filename):
    """
    Check if file already exists in output directory
    
    Args:
        output_dir: Directory to check
        filename: Filename to check
    
    Returns:
        Boolean indicating if file exists
    """
    file_path = os.path.join(output_dir, filename)
    return os.path.exists(file_path)

def download_imerg_file(url, username, password, output_dir):
    """
    Download a single IMERG file
    
    Args:
        url: URL of the file to download
        username: NASA Earthdata username
        password: NASA Earthdata password
        output_dir: Directory to save the downloaded file
    
    Returns:
        Path to the downloaded file
    """
    filename = os.path.basename(url)
    output_path = os.path.join(output_dir, filename)
    
    # Skip if file already exists
    if os.path.exists(output_path):
        logger.info(f"File {filename} already exists, skipping download")
        return output_path
    
    logger.info(f"Downloading {filename}")
    
    try:
        response = requests.get(url, auth=HTTPBasicAuth(username, password), stream=True)
        response.raise_for_status()
        
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        logger.info(f"Successfully downloaded {filename}")
        return output_path
    
    except requests.RequestException as e:
        logger.error(f"Error downloading {filename}: {e}")
        return None

def clip_to_extent(src_path, dst_path, extent):
    """
    Clip raster to the specified extent
    
    Args:
        src_path: Path to source raster
        dst_path: Path to save clipped raster
        extent: List of [min_lon, max_lon, min_lat, max_lat]
    
    Returns:
        Path to clipped raster
    """
    logger.info(f"Clipping {os.path.basename(src_path)} to East Africa extent")
    
    try:
        # Open with rioxarray
        with rioxarray.open_rasterio(src_path) as rds:
            # Clip to extent
            clipped = rds.rio.clip_box(
                minx=extent[0],
                miny=extent[2],
                maxx=extent[1],
                maxy=extent[3]
            )
            
            # Save clipped raster to temporary file
            clipped.rio.to_raster(dst_path)
            
        logger.info(f"Successfully clipped to extent")
        return dst_path
    
    except Exception as e:
        logger.error(f"Error clipping raster: {e}")
        return None

def reproject_tif(src_path, dst_path):
    """
    Reproject GeoTIFF to EPSG:4326 and prepare for COG conversion
    
    Args:
        src_path: Path to source GeoTIFF
        dst_path: Path to save reprojected GeoTIFF
    
    Returns:
        Path to reprojected GeoTIFF
    """
    logger.info(f"Reprojecting {os.path.basename(src_path)} to EPSG:4326")
    
    dst_crs = 'EPSG:4326'
    
    try:
        with rasterio.open(src_path) as src:
            # Check if reprojection is needed
            if src.crs == dst_crs:
                logger.info("Source already in EPSG:4326, skipping reprojection")
                # Just copy the file if no reprojection needed
                with rasterio.open(src_path) as src:
                    profile = src.profile.copy()
                    profile.update({
                        "tiled": True,
                        "blockxsize": 512,
                        "blockysize": 512,
                        "compress": "deflate",
                        "interleave": "band"
                    })
                    
                    with MemoryFile() as memfile:
                        with memfile.open(**profile) as mem:
                            mem.write(src.read())
                        
                        # Convert to COG
                        cog_profile = cog_profiles.get("deflate")
                        cog_translate(
                            memfile,
                            dst_path,
                            cog_profile,
                            in_memory=True
                        )
                
                return dst_path
            
            # Calculate transformation parameters
            transform, width, height = calculate_default_transform(
                src.crs, dst_crs, src.width, src.height, *src.bounds
            )
            
            # Setup profile for output
            profile = src.profile.copy()
            profile.update({
                "crs": dst_crs,
                "transform": transform,
                "width": width,
                "height": height,
                "driver": "GTiff",
                "tiled": True,
                "blockxsize": 512,
                "blockysize": 512,
                "compress": "deflate",
                "interleave": "band"
            })
            
            # Reproject to memory file
            with MemoryFile() as memfile:
                with memfile.open(**profile) as mem:
                    for i in range(1, src.count + 1):
                        reproject(
                            source=rasterio.band(src, i),
                            destination=rasterio.band(mem, i),
                            src_transform=src.transform,
                            src_crs=src.crs,
                            dst_transform=transform,
                            dst_crs=dst_crs,
                            resampling=Resampling.nearest
                        )
                    
                # Convert to COG
                cog_profile = cog_profiles.get("deflate")
                cog_translate(
                    memfile,
                    dst_path,
                    cog_profile,
                    in_memory=True
                )
        
        logger.info(f"Successfully reprojected and converted to COG")
        return dst_path
    
    except Exception as e:
        logger.error(f"Error reprojecting raster: {e}")
        return None

def convert_to_cog(src_path, dst_path):
    """
    Convert GeoTIFF to Cloud Optimized GeoTIFF with LZW compression
    
    Args:
        src_path: Path to source GeoTIFF
        dst_path: Path to save COG
    
    Returns:
        Path to COG
    """
    logger.info(f"Converting {os.path.basename(src_path)} to COG with LZW compression")
    
    try:
        # Read data with xarray
        with rioxarray.open_rasterio(src_path) as rds:
            # Ensure data is float32
            data_array = rds.astype(np.float32)
            
            # Set CRS if not already set
            if not data_array.rio.crs:
                data_array.rio.write_crs("EPSG:4326", inplace=True)
            
            # Write to temporary file
            tmp_file_path = f"{dst_path}_tmp.tif"
            data_array.rio.to_raster(
                tmp_file_path,
                driver='GTiff',
                compress='LZW',
                dtype='float32',
                nodata=np.nan
            )
        
        # Convert to COG
        cog_profile = cog_profiles.get("lzw")
        cog_profile.update({"blockxsize": 512, "blockysize": 512})
        
        cog_translate(
            tmp_file_path,
            dst_path,
            cog_profile,
            in_memory=False,
            quiet=True
        )
        
        # Remove temporary file
        if os.path.exists(tmp_file_path):
            os.remove(tmp_file_path)
        
        logger.info(f"Successfully converted to COG with LZW compression")
        return dst_path
    
    except Exception as e:
        logger.error(f"Error converting to COG: {e}")
        return None

def upload_to_gcs(src_path, bucket_name, gcs_path):
    """
    Upload file to Google Cloud Storage
    
    Args:
        src_path: Path to source file
        bucket_name: GCS bucket name
        gcs_path: Destination path in GCS bucket
    
    Returns:
        GCS URL of uploaded file
    """
    # Only upload COG files, skip clipped files
    if '_cog.tif' not in src_path:
        logger.info(f"Skipping upload of non-COG file: {os.path.basename(src_path)}")
        return None
    
    # Remove 'gs://' prefix from bucket name if present
    if bucket_name.startswith('gs://'):
        bucket_name = bucket_name.replace('gs://', '', 1)
        logger.info(f"Removing 'gs://' prefix from bucket name. Using: {bucket_name}")
    
    logger.info(f"Uploading COG file {os.path.basename(src_path)} to GCS bucket {bucket_name}")
    
    # Get credentials from environment variable or service account file
    credentials_file = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    
    try:
        if credentials_file and os.path.exists(credentials_file):
            # Use service account file
            credentials = service_account.Credentials.from_service_account_file(
                credentials_file
            )
            client = storage.Client(credentials=credentials)
        else:
            # Use default credentials
            client = storage.Client()
        
        # Set GCS path to IMERG_COG folder
        filename = os.path.basename(src_path)
        gcs_path = f"IMERG_COG/{filename}"
        
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(gcs_path)
        
        # Upload file
        blob.upload_from_filename(src_path)
        
        gcs_url = f"gs://{bucket_name}/{gcs_path}"
        logger.info(f"Successfully uploaded to {gcs_url}")
        return gcs_url
    
    except Exception as e:
        logger.error(f"Error uploading to GCS: {e}")
        return None

def process_imerg_file(file_path, output_dir, bucket_name, date_str):
    """
    Process a single IMERG file: clip, reproject, convert to COG, and upload to GCS
    
    Args:
        file_path: Path to IMERG file
        output_dir: Directory to save processed files
        bucket_name: GCS bucket name
        date_str: Date string for the file (YYYYMMDD)
    
    Returns:
        Dictionary with paths to processed files and GCS URLs
    """
    logger.info(f"Processing IMERG file: {os.path.basename(file_path)}")
    
    filename = os.path.basename(file_path)
    
    # Extract base name for output files
    # Format: 3B-HHR-E.MS.MRG.3IMERG.20240415-S233000-E235959.1410.V07B.1day.tif
    base_name = filename.split('.tif')[0]
    
    # Create output subdirectories
    clipped_dir = os.path.join(output_dir, "IMERG_CLIPPED_EA")
    cog_dir = os.path.join(output_dir, "IMERG_COG")
    
    os.makedirs(clipped_dir, exist_ok=True)
    os.makedirs(cog_dir, exist_ok=True)
    
    # Create output paths
    clipped_path = os.path.join(clipped_dir, f"{base_name}_eastafrica.tif")
    cog_path = os.path.join(cog_dir, f"{base_name}_eastafrica_cog.tif")
    
    # Check if output already exists
    if os.path.exists(cog_path):
        logger.info(f"Final output file {os.path.basename(cog_path)} already exists, skipping processing")
        return {
            "original_file": file_path,
            "clipped_file": clipped_path if os.path.exists(clipped_path) else None,
            "cog_file": cog_path,
            "gcs_url": None  # Will be populated if upload is requested
        }
    
    # GCS path
    year = date_str[:4]
    month = date_str[4:6]
    day = date_str[6:8]
    gcs_path = f"IMERG_COG/{year}/{month}/{day}/{base_name}_eastafrica_cog.tif"
    
    # Process file
    result = {
        "original_file": file_path,
        "clipped_file": None,
        "cog_file": None,
        "gcs_url": None
    }
    
    # 1. Clip to East Africa extent
    logger.info(f"Clipping {filename} to East Africa extent")
    clipped_file = clip_to_extent(file_path, clipped_path, EXTENT)
    if not clipped_file:
        logger.error(f"Failed to clip {filename}!")
        return result
    result["clipped_file"] = clipped_file
    logger.info(f"Successfully clipped to: {os.path.basename(clipped_path)}")
    
    # 2. Reproject to EPSG:4326 and convert to COG
    logger.info(f"Converting {os.path.basename(clipped_path)} to COG format")
    cog_file = reproject_tif(clipped_file, cog_path)
    if not cog_file:
        logger.error(f"Failed to convert {os.path.basename(clipped_path)} to COG!")
        return result
    result["cog_file"] = cog_file
    logger.info(f"Successfully created COG: {os.path.basename(cog_path)}")
    
    # 3. Upload to GCS if requested
    do_upload = os.getenv('UPLOAD_TO_GCS', 'False').lower() in ('true', 'yes', '1', 't')
    if do_upload:
        logger.info(f"Uploading {os.path.basename(cog_path)} to GCS")
        gcs_url = upload_to_gcs(cog_file, bucket_name, gcs_path)
        result["gcs_url"] = gcs_url
        if gcs_url:
            logger.info(f"Successfully uploaded to GCS: {gcs_url}")
        else:
            logger.error(f"Failed to upload {os.path.basename(cog_path)} to GCS!")
    else:
        logger.info(f"Upload to GCS skipped as requested")
    
    return result
    
    # GCS path
    year = date_str[:4]
    month = date_str[4:6]
    day = date_str[6:8]
    gcs_path = f"imerg/{year}/{month}/{day}/{base_name}_eastafrica_cog.tif"
    
    # Process file
    result = {
        "original_file": file_path,
        "clipped_file": None,
        "cog_file": None,
        "gcs_url": None
    }
    
    # 1. Clip to East Africa extent
    clipped_file = clip_to_extent(file_path, clipped_path, EXTENT)
    if not clipped_file:
        return result
    result["clipped_file"] = clipped_file
    
    # 2. Reproject to EPSG:4326 and convert to COG
    cog_file = reproject_tif(clipped_file, cog_path)
    if not cog_file:
        return result
    result["cog_file"] = cog_file
    
    # 3. Upload to GCS - controlled by environment variable
    do_upload = os.getenv('UPLOAD_TO_GCS', 'False').lower() in ('true', 'yes', '1', 't')
    if do_upload:
        gcs_url = upload_to_gcs(cog_file, bucket_name, gcs_path)
        result["gcs_url"] = gcs_url
    else:
        logger.info(f"Upload to GCS skipped as requested")
    
    return result

def main(start_date=None, end_date=None, output_dir=None, bucket_name=None, skip_existing=True):
    """
    Main function to download, process, and upload IMERG data
    
    Args:
        start_date: Start date in YYYYMMDD format (from env IMERG_START_DATE or calculated)
        end_date: End date in YYYYMMDD format (from env IMERG_END_DATE or calculated)
        output_dir: Directory to save processed files (default: from ENV or ./output)
        bucket_name: GCS bucket name (default: from ENV)
        skip_existing: Skip processing if files already exist (default: True)
    
    Returns:
        List of processed files and their local paths
    """
    # Get dates from environment variables
    env_start_date = os.getenv('IMERG_START_DATE')
    env_end_date = os.getenv('IMERG_END_DATE')
    env_days_back = os.getenv('IMERG_DAYS_BACK')
    
    # Calculate default dates based on environment variables or fallback values
    today = datetime.now()
    default_end_date = (today - timedelta(days=1)).strftime('%Y%m%d')  # Yesterday
    
    # If IMERG_DAYS_BACK is set, use that for the default start date
    if env_days_back:
        try:
            days_back = int(env_days_back)
            default_start_date = (today - timedelta(days=days_back)).strftime('%Y%m%d')
            logger.info(f"Using IMERG_DAYS_BACK={days_back}, calculated start date: {default_start_date}")
        except ValueError:
            logger.warning(f"Invalid IMERG_DAYS_BACK value: {env_days_back}. Using 7 days as default.")
            default_start_date = (today - timedelta(days=7)).strftime('%Y%m%d')
    else:
        # Use IMERG_LAST_DAYS if available (for backward compatibility)
        default_days = 7
        env_last_days = os.getenv('IMERG_LAST_DAYS')
        if env_last_days:
            try:
                default_days = int(env_last_days)
                logger.info(f"Using IMERG_LAST_DAYS={default_days} to calculate start date")
            except ValueError:
                logger.warning(f"Invalid IMERG_LAST_DAYS value: {env_last_days}. Using default of 7 days.")
        
        default_start_date = (today - timedelta(days=default_days)).strftime('%Y%m%d')
    
    # Set final values with priority: Function args > ENV vars > calculated defaults
    if not start_date:
        start_date = env_start_date if env_start_date else default_start_date
        logger.info(f"Using start date: {start_date} (source: {'environment variable' if env_start_date else 'calculated default'})")
    
    if not end_date:
        end_date = env_end_date if env_end_date else default_end_date
        logger.info(f"Using end date: {end_date} (source: {'environment variable' if env_end_date else 'calculated default'})")
    
    if not output_dir:
        output_dir = os.getenv('OUTPUT_DIR', './output')
    
    if not bucket_name:
        bucket_name = os.getenv('GCS_BUCKET_NAME', 'dummy-bucket')
    
    logger.info(f"Processing IMERG data from {start_date} to {end_date}")
    logger.info(f"Output directory: {output_dir}")
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Create a download directory if specified
    download_dir = os.getenv('DOWNLOAD_DIR', output_dir)
    os.makedirs(download_dir, exist_ok=True)
    
    # Get IMERG credentials
    username = os.getenv('IMERG_USERNAME')
    password = os.getenv('IMERG_PASSWORD')
    
    if not username or not password:
        logger.error("IMERG credentials not found in environment variables")
        return None
    
    # List IMERG files
    url = "https://jsimpsonhttps.pps.eosdis.nasa.gov/imerg/gis/early/"
    file_filter = '-S233000-E235959.1410.V07B.1day.tif'
    
    logger.info(f"Using file filter: {file_filter}")
    
    file_list = list_imerg_files_by_date(
        url, file_filter, username, password, start_date, end_date
    )
    
    if not file_list:
        logger.warning(f"No IMERG files found for date range {start_date} to {end_date}")
        return []
    
    logger.info(f"Found {len(file_list)} IMERG files to process")
    
    # Check which files need to be downloaded (avoid downloading if they already exist)
    files_to_download = []
    for file_url in file_list:
        filename = os.path.basename(file_url)
        if not check_file_exists(download_dir, filename):
            files_to_download.append(file_url)
    
    logger.info(f"{len(files_to_download)} of {len(file_list)} files need to be downloaded")
    
    # Download and process files
    results = []
    
    # Download new files
    for file_url in files_to_download:
        downloaded_file = download_imerg_file(file_url, username, password, download_dir)
    
    # Process both newly downloaded and existing files
    for file_url in file_list:
        filename = os.path.basename(file_url)
        file_path = os.path.join(download_dir, filename)
        
        # Skip if file doesn't exist (download failed)
        if not os.path.exists(file_path):
            logger.warning(f"File {filename} does not exist, skipping processing")
            continue
        
        # Extract date from filename using regex
        date_match = re.search(r'3IMERG.(\d{8})', filename)
        
        if not date_match:
            logger.warning(f"Could not extract date from filename: {filename}")
            continue
        
        date_str = date_match.group(1)
        logger.info(f"Extracted date {date_str} from filename {filename}")
        
        # Check if output already exists and we're skipping existing files
        base_name = filename.split('.tif')[0]  # Get everything before .tif
        cog_path = os.path.join(output_dir, f"{base_name}_eastafrica_cog.tif")
        
        if skip_existing and os.path.exists(cog_path):
            logger.info(f"Processed file {os.path.basename(cog_path)} already exists, skipping processing")
            result = {
                "original_file": file_path,
                "clipped_file": os.path.join(output_dir, f"{base_name}_eastafrica.tif"),
                "cog_file": cog_path,
                "gcs_url": None
            }
        else:
            # Process file
            result = process_imerg_file(file_path, output_dir, bucket_name, date_str)
        
        if result.get("cog_file"):
            results.append(result)
    
    logger.info(f"Processed {len(results)} IMERG files")
    return results

if __name__ == "__main__":
    # Set up a file handler for logging
    log_dir = "logs"
    os.makedirs(log_dir, exist_ok=True)
    
    # Create timestamped log filename
    log_timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    log_file = os.path.join(log_dir, f"imerg_processing_{log_timestamp}.log")
    
    # Add file handler to logger
    file_handler = logging.FileHandler(log_file)
    file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    logger.addHandler(file_handler)
    
    logger.info("=" * 80)
    logger.info("STARTING IMERG PROCESSING")
    logger.info("=" * 80)
    
    parser = argparse.ArgumentParser(description='Download, process, and upload IMERG data')
    parser.add_argument('--start-date', type=str, default=None,
                        help='Start date in YYYYMMDD format (override ENV: IMERG_START_DATE)')
    parser.add_argument('--end-date', type=str, default=None,
                        help='End date in YYYYMMDD format (override ENV: IMERG_END_DATE)')
    parser.add_argument('--output-dir', type=str, default=None,
                        help='Directory to save processed files (override ENV: OUTPUT_DIR)')
    parser.add_argument('--bucket-name', type=str, default=None,
                        help='GCS bucket name (override ENV: GCS_BUCKET_NAME)')
    parser.add_argument('--skip-existing', action='store_true',
                        help='Skip processing if files already exist')
    
    args = parser.parse_args()
    
    # Get skip-existing from environment if not provided as arg
    skip_existing = args.skip_existing
    if not skip_existing:
        skip_existing = os.getenv('SKIP_EXISTING', 'True').lower() in ('true', 'yes', '1', 't')
    
    start_time = datetime.now()
    logger.info(f"Process started at: {start_time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    result = main(
        args.start_date, 
        args.end_date, 
        args.output_dir, 
        args.bucket_name,
        skip_existing
    )
    
    end_time = datetime.now()
    processing_time = end_time - start_time
    
    if result:
        logger.info("=" * 80)
        logger.info("IMERG processing completed successfully!")
        
        # Count successfully processed files
        success_count = sum(1 for r in result if r.get('cog_file'))
        logger.info(f"Successfully processed {success_count} of {len(result)} IMERG files")
        
        # List details of processed files
        logger.info("Processed files:")
        for idx, r in enumerate(result, 1):
            if r.get('cog_file'):
                cog_file = os.path.basename(r['cog_file'])
                gcs_url = r.get('gcs_url', 'Not uploaded')
                logger.info(f"  {idx}. {cog_file} -> {gcs_url}")
    else:
        logger.error("=" * 80)
        logger.error("IMERG processing failed")
    
    logger.info(f"Process ended at: {end_time.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"Total processing time: {processing_time}")
    logger.info("=" * 80)
    
    # Print path to log file
    print(f"Process completed. Log file saved to: {log_file}")