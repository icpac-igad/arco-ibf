# IMERG Data Processing Pipeline for East Africa

## Overview

This repository contains a Python script for downloading, processing, and uploading IMERG (Integrated Multi-satellitE Retrievals for GPM) satellite precipitation data for the East Africa region. The pipeline performs the following tasks:

1. Downloads IMERG satellite data for specified date(s)
2. Subsets data to East Africa region
3. Converts to Cloud Optimized GeoTIFF (COG) format
4. Uploads processed files to Google Cloud Storage

This pipeline is part of the ARCO IBF (Impact-Based Forecasting) system at ICPAC-IGAD, supporting East Africa regional hazard monitoring. The script is currently configured to process 7-day rolling data from IMERG for operational use.

## Requirements

- Python 3.x
- NASA Earthdata credentials
- Google Cloud Storage credentials (for upload feature)

## Current Implementation Status

The pipeline is currently operational and has been successfully tested with 50 Days data. Daily IMERG data is being processed and uploaded to the `imergv8_ea` GCS bucket. The process has been configured to run for the last 7 days by default, but can be adjusted to process specific date ranges as needed.

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/icpac-igad/arco-ibf.git
   cd arco-ibf
   ```

2. Create and activate a virtual environment:
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install the required packages:
   ```
   pip install -r requirements.txt
   ```

4. Set up environment variables:
   ```
- Copy `.env.sample` to `.env`:
  ```
  cp .env.sample .env
  ```
- Edit the `.env` file with your credentials and preferences

## Directory Structure

## Directory Structure

```
├── credentials/                 # GCS service account credentials
│   └── gcs-key.json
├── logs/                        # Log files
│   └── imerg_processing_*.log
├── output/                      # Downloaded and processed data
│   ├── IMERG_CLIPPED_EA/        # Clipped rasters
│   └── IMERG_COG/               # Cloud Optimized GeoTIFFs
├── venv/                        # Python virtual environment
├── .env                         # Environment variables (not tracked by git)
├── .gitignore                   # Git ignore file
├── imerg-download-cog-upload.py # Main script
├── README.md                    # This file
└── requirements.txt             # Python dependencies
```

## Usage

### Basic Usage

Run the script with default parameters (processes the last 7 days):

```bash
python imerg-download-cog-upload.py
```

### Custom Date Range

Specify a custom date range:

```bash
python imerg-download-cog-upload.py --start-date 20250401 --end-date 20250410
```

### Output Directory

Specify a custom output directory:

```bash
python imerg-download-cog-upload.py --output-dir /path/to/custom/output
```

### Skip Existing Files

Skip processing if files already exist:

```bash
python imerg-download-cog-upload.py --skip-existing
```

### Full Command Options

```
usage: imerg-download-cog-upload.py [-h] [--start-date START_DATE] [--end-date END_DATE]
                             [--output-dir OUTPUT_DIR] [--bucket-name BUCKET_NAME]
                             [--skip-existing]

Download, process, and upload IMERG data

optional arguments:
  -h, --help            show this help message and exit
  --start-date START_DATE
                        Start date in YYYYMMDD format (override ENV: IMERG_START_DATE)
  --end-date END_DATE   End date in YYYYMMDD format (override ENV: IMERG_END_DATE)
  --output-dir OUTPUT_DIR
                        Directory to save processed files (override ENV: OUTPUT_DIR)
  --bucket-name BUCKET_NAME
                        GCS bucket name (override ENV: GCS_BUCKET_NAME)
  --skip-existing       Skip processing if files already exist
```

## Environment Variables

You can control the script's behavior using environment variables in a `.env` file:

- `IMERG_USERNAME`: NASA Earthdata username
- `IMERG_PASSWORD`: NASA Earthdata password
- `IMERG_START_DATE`: Start date (YYYYMMDD)
- `IMERG_END_DATE`: End date (YYYYMMDD)
- `IMERG_DAYS_BACK`: Process data for N days back from today
- `OUTPUT_DIR`: Directory to save processed files
- `DOWNLOAD_DIR`: Directory to save downloaded files (defaults to OUTPUT_DIR)
- `GCS_BUCKET_NAME`: Google Cloud Storage bucket name
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to GCS credentials file
- `UPLOAD_TO_GCS`: Whether to upload files to GCS (True/False)
- `SKIP_EXISTING`: Skip processing if files already exist (True/False)
- `EXTENT_X1`, `EXTENT_X2`, `EXTENT_Y1`, `EXTENT_Y2`: East Africa extent coordinates

## Processing Steps

1. **File Discovery**: Searches NASA servers for IMERG data files within the specified date range
2. **Download**: Downloads IMERG GeoTIFF files from NASA servers
3. **Clip**: Subsets the data to the East Africa region
4. **Convert to COG**: Reprojects (if needed) and converts to Cloud Optimized GeoTIFF format
5. **Upload**: Optionally uploads processed files to Google Cloud Storage

## Output Files

The script produces the following files:

- Original downloaded files in the output directory
- Clipped files in `output/IMERG_CLIPPED_EA/`
- Cloud Optimized GeoTIFFs in `output/IMERG_COG/`

The COG files follow this naming pattern:
```
3B-HHR-E.MS.MRG.3IMERG.YYYYMMDD-S233000-E235959.1410.V07B.1day_eastafrica_cog.tif
```

## Logging

Logs are saved in the `logs/` directory with timestamps:
```
logs/imerg_processing_YYYYMMDD_HHMMSS.log
```


## Contact

For questions or issues, contact the ICPAC-IGAD team.
