# Rainfall Endpoint Error Analysis

## Issue Summary
The `/rainfall/zones` endpoint returns a 500 Internal Server Error when accessed on the deployed Replit server, despite working correctly in local testing.

## Server Environment
- **Platform**: Replit deployment
- **Memory**: 1GB RAM
- **Exit Status**: 137 (SIGKILL - killed by system)
- **Error**: `error proxying request error=EOF`

## Root Cause Analysis

### Memory Constraint Issue
The primary issue is **memory exhaustion** on the 1GB Replit server:

1. **Parquet File Size**: 22MB on disk
2. **Memory Usage When Loaded**: ~511MB for DataFrame + additional overhead
3. **Total Process Memory**: >1GB when including:
   - TiPG application framework
   - FastAPI/Uvicorn server
   - Database connections
   - Other dependencies

### Memory Usage Breakdown
```
- Base Python process: ~110MB
- TiPG + FastAPI framework: ~200-300MB
- Parquet DataFrame: ~511MB
- Additional overhead: ~200-300MB
- Total: >1.2GB (exceeds 1GB limit)
```

### Technical Details

#### Dataset Size
- **Records**: 16,747,127 rows
- **Columns**: 4 (zone, date, gridcode, rainfall_mm)
- **Memory footprint**: 511MB when loaded into pandas DataFrame

#### Server Behavior
1. Server starts successfully
2. Loads TiPG framework and database connections
3. Attempts to load parquet data on first endpoint access
4. Memory usage exceeds 1GB limit
5. System kills process with SIGKILL (exit code 137)
6. Proxy connection terminated (EOF error)

## Why This Doesn't Require Reverse Proxy or Different Credentials

The issue is **not** related to:
- **Authentication**: Credentials work fine (evident from local success)
- **Network/Proxy**: The server reaches the data loading stage
- **GCS Access**: The problem occurs during memory allocation, not data fetching

The error occurs **after** successful GCS authentication but **during** the memory-intensive DataFrame creation.

## Solutions

### Immediate Solutions

1. **Upgrade Server Memory**
   - Increase Replit deployment to 2GB+ RAM
   - This is the simplest solution for the current architecture

2. **Lazy Loading Implementation**
   ```python
   # Load data in chunks or on-demand
   def get_zones_efficiently():
       # Use pandas.read_parquet with column selection
       zones_only = pd.read_parquet('file.parquet', columns=['zone'])
       return zones_only['zone'].unique()
   ```

3. **Data Preprocessing**
   - Create a smaller metadata file with just zone information
   - Store summary data separately from full dataset

### Long-term Solutions

1. **Streaming Data Access**
   - Use PyArrow for memory-efficient parquet reading
   - Implement chunked data processing

2. **External Data Service**
   - Move data processing to a separate service with more memory
   - Use API calls instead of in-memory processing

3. **Database Storage**
   - Load parquet data into PostgreSQL on startup
   - Use SQL queries instead of pandas operations

## Recommended Immediate Action

**Upgrade the Replit deployment to 2GB RAM** as this will:
- Resolve the immediate memory constraint
- Maintain current architecture without code changes
- Allow proper error handling to function (currently killed before error responses)

## Code Changes Made

1. **Enhanced Error Handling** (`tipg_server_parquet.py:82-115`)
   - Added try-catch around zone loading
   - Provide detailed error responses
   - Include data loading status in error messages

2. **Credential File Validation** (`parquet_rain_data_manager.py:33-36`)
   - Check if credentials file exists before setting environment variable
   - Graceful fallback to environment-based authentication

However, these changes won't resolve the core memory issue - they only improve error reporting when memory is sufficient.

## Testing Results

- **Local (64GB RAM)**: Works perfectly, loads 511MB dataset without issues
- **Deployed (1GB RAM)**: Process killed by system before endpoint can respond
- **Memory Growth**: ~1GB+ total process memory when dataset loads

The 1GB memory limit is the definitive bottleneck preventing successful operation.