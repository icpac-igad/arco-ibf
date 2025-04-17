#!/usr/bin/env python
"""
GCS Setup Utility

This script helps set up the Google Cloud Storage credentials for the COG Viewer application.
It can be run from the command line to configure GCS access without using the web interface.

Usage:
    python setup_gcs.py --credentials-file <path_to_file> [--bucket <bucket_name>] [--project-id <project_id>]

Example:
    python setup_gcs.py --credentials-file service-account.json --bucket my-data-bucket --project-id my-gcp-project
"""

import argparse
import logging
import sys
from app import load_credentials_from_file

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def main():
    parser = argparse.ArgumentParser(description='Set up GCS credentials for COG Viewer')
    parser.add_argument('--credentials-file', required=True, help='Path to the GCS credentials JSON file')
    parser.add_argument('--bucket', help='GCS bucket name (optional, defaults to plotpotential-public)')
    parser.add_argument('--project-id', help='GCP project ID (optional)')
    
    args = parser.parse_args()
    
    credentials_file = args.credentials_file
    bucket = args.bucket
    project_id = args.project_id
    
    logger.info(f"Loading credentials from file: {credentials_file}")
    logger.info(f"Using bucket: {bucket or 'default'}")
    logger.info(f"Using project ID: {project_id or 'default'}")
    
    # Load credentials and initialize the GCS client
    success, message = load_credentials_from_file(credentials_file, bucket, project_id)
    
    if success:
        logger.info("GCS setup completed successfully!")
        logger.info(message)
        return 0
    else:
        logger.error("GCS setup failed!")
        logger.error(message)
        return 1

if __name__ == "__main__":
    sys.exit(main())