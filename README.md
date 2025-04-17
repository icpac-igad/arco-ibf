# COG Viewer

A Flask-based web application for visualizing weather data using Cloud-Optimized GeoTIFF (COG) files streamed from Google Cloud Storage, with interactive map visualization capabilities.

## Features

- Interactive map visualization of weather data
- Stream Cloud-Optimized GeoTIFF files directly from Google Cloud Storage
- Support for both public and private (authenticated) GCS buckets
- Temperature, wind, and rainfall data visualization
- Server-side proxy to handle authenticated GCS access

## Configuration

### GCS Authentication

The application supports two modes of accessing GCS data:

1. **Public Mode**: Works with public buckets without authentication (default)
2. **Authenticated Mode**: Uses service account credentials to access private buckets

### Setting up GCS Credentials

There are multiple ways to configure GCS credentials:

#### Option 1: Using Environment Variables

Set the following environment variables:

```bash
export GCS_CREDENTIALS='{"type": "service_account", "project_id": "your-project", ...}'
export GCS_BUCKET_NAME='your-bucket-name'
export GOOGLE_CLOUD_PROJECT='your-project-id'
```

#### Option 2: Using the Command-Line Tool

Use the included `setup_gcs.py` script to set up credentials from a service account JSON file:

```bash
python setup_gcs.py --credentials-file /path/to/service-account.json --bucket your-bucket-name --project-id your-project-id
```

#### Option 3: Using the API

Send a POST request to the `/api/set-credentials` endpoint:

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"credentials": {"type": "service_account", ...}, "bucket": "your-bucket", "project_id": "your-project-id"}' \
  http://localhost:5000/api/set-credentials
```

### Credentials Storage

Credentials are stored in:

1. Environment variables (temporary, for the current session)
2. Configuration file at `.config/gcs_config.json` (persistent across application restarts)

## Usage

### Starting the Server

```bash
gunicorn --bind 0.0.0.0:5000 --reuse-port --reload main:app
```

### Testing the Authentication

To verify GCS authentication is working, visit:

```
http://localhost:5000/api/test-gcs-auth
```

### Proxy Endpoint

Access GCS files through the proxy endpoint:

```
http://localhost:5000/proxy/gcs/{bucket_name}/{file_path}
```

Or using the configured default bucket:

```
http://localhost:5000/proxy/gcs/{file_path}
```

## File Naming Pattern

This application expects COG files to follow this naming pattern:

```
{parameter}_{ensemble_member}_{YYYY}_{MM}_{DD}_{HH}.tif
```

For example:
```
temperature_2m_0_2025_04_12_00.tif
```

## API Endpoints

- `/api/cog-status`: Get information about the current GCS configuration
- `/api/refresh-credentials`: Refresh GCS credentials from environment variables
- `/api/set-credentials`: Set GCS credentials from JSON payload
- `/api/test-gcs-auth`: Test GCS authentication and list available files