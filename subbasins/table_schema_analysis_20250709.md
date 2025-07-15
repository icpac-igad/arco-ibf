# TiPG Table Schema Analysis and Cleanup - July 9, 2025

## Issue Investigation

### Problem Statement
The deployed TiPG collections showed different data formats:
- `geofsm_zones`: Clean, readable items with simple properties
- `geofsm_zones_v2`, `geosfm_poly`, `geosfm_poly2`: Long encoded lists and complex data structures

### Root Cause Analysis

The issue stems from **different upload methods** that process shapefile data differently:

#### 1. **Clean Tables** (`geofsm_zones`)
- **Upload Method**: `upload_shapefile_only.py`
- **Processing**: 
  - Filters to essential columns only: `geometry`, `gridcode`, `zone`
  - Normalizes column names (GRIDCODE → gridcode)
  - Creates lightweight spatial tables for efficient joining
- **Result**: Clean, readable GeoJSON with minimal properties

#### 2. **Complex Tables** (`geofsm_zones_v2`, `geosfm_poly*`)
- **Upload Method**: Various scripts with different approaches
- **Processing**:
  - Preserves ALL original shapefile columns
  - Adds time-series rainfall data as additional columns
  - Creates wide tables with many attributes
- **Result**: Complex items with extensive properties and metadata

## Table Schema Comparison

### `geofsm_zones` (CLEAN - RECOMMENDED)
```json
{
  "type": "Feature",
  "properties": {
    "id": 1,
    "gridcode": 370,
    "zone": "zone4"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [...]
  }
}
```

**Schema**:
- `id`: integer (primary key)
- `gridcode`: integer (spatial identifier)
- `zone`: text (zone classification)
- `geometry`: geometry (PostGIS spatial column)

### `geofsm_zones_v2` (COMPLEX - TO BE REMOVED)
```json
{
  "type": "Feature",
  "properties": {
    "id": 1180,
    "gridcode": 370,
    "zone": "zone4",
    // ... potentially many more columns from original shapefile
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [... very long coordinate list ...]
  }
}
```

**Schema**:
- Same as `geofsm_zones` but with additional columns
- Potentially includes original shapefile attributes
- May include time-series data embedded as columns

### `geosfm_poly*` (COMPLEX - TO BE REMOVED)
These tables contain enhanced spatial data with time-series rainfall information added as individual columns:
- `rainfall_2011_01_01`: numeric
- `rainfall_2011_01_02`: numeric
- ... (hundreds of date columns)

This creates extremely wide tables that result in long, encoded-looking JSON responses.

## Upload Method Analysis

### 1. `upload_shapefile_only.py` ✅ RECOMMENDED
```python
# Filters to essential columns only
essential_columns = ['geometry']
if 'GRIDCODE' in gdf.columns:
    essential_columns.append('GRIDCODE')
if 'zone' in gdf.columns:
    essential_columns.append('zone')

gdf_spatial = gdf[essential_columns].copy()

# Normalize column names
if 'GRIDCODE' in gdf_spatial.columns:
    gdf_spatial = gdf_spatial.rename(columns={'GRIDCODE': 'gridcode'})
```

**Purpose**: Create clean spatial tables for TiPG with minimal attributes
**Result**: Readable, efficient collections

### 2. `upload_geofsm.py` ⚠️ CREATES COMPLEX TABLES
```python
# Uploads ALL columns from shapefile
gdf.to_postgis(name=table_name, con=engine, if_exists='replace')
```

**Purpose**: Preserve complete shapefile data
**Result**: Complex collections with many attributes

### 3. Time-Series Enhancement Scripts ⚠️ CREATES WIDE TABLES
```python
# Adds rainfall data as individual columns
for date in dates:
    column_name = f"rainfall_{date.strftime('%Y_%m_%d')}"
    # Add column to existing table
```

**Purpose**: Embed time-series data directly into spatial tables
**Result**: Very wide tables with hundreds of columns

## Solution: Database Cleanup

### Tables to KEEP
- **`geofsm_zones`**: Clean spatial data with essential attributes only
  - 3,197 features
  - 4 columns: id, gridcode, zone, geometry
  - Proper spatial indexing
  - Clean GeoJSON output

### Tables to REMOVE
- **`geofsm_zones_v2`**: Duplicate with potential extra columns
- **`geosfm_poly`**: Test table with complex time-series data
- **`geosfm_poly2`**: Another test table with complex data
- **`sample_*`**: Test/sample tables not needed for production

### Cleanup Process

1. **Run `cleanup_database_tables.py`**:
   ```bash
   python cleanup_database_tables.py
   ```

2. **Verify collections**:
   - Check `/collections` endpoint
   - Verify only clean tables remain
   - Test data readability

## Best Practices for Future Uploads

### For Clean TiPG Collections
✅ **Use `upload_shapefile_only.py`** approach:
- Filter to essential spatial columns only
- Normalize column names
- Create lightweight spatial tables
- Use separate time-series data management

### For Time-Series Data
✅ **Use `rain_data_manager.py`** approach:
- Keep spatial and temporal data separate
- Load time-series data from text files
- Join data dynamically in API endpoints
- Avoid embedding time-series in spatial tables

### Environment Variables
For clean TiPG discovery:
```bash
TIPG_DB_SCHEMAS=public
TIPG_DB_ONLY_SPATIAL_TABLES=FALSE
TIPG_DEBUG=TRUE
```

## Expected Results After Cleanup

### TiPG Collections Endpoint
```json
{
  "collections": [
    {
      "id": "public.geofsm_zones",
      "title": "geofsm_zones",
      "description": "Clean spatial zones data",
      "extent": {
        "spatial": {
          "bbox": [[-11.49, 23.45, 23.75, 51.12]]
        }
      },
      "links": [
        {
          "rel": "items",
          "href": "/collections/public.geofsm_zones/items"
        }
      ]
    }
  ]
}
```

### Clean Item Response
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": 1,
        "gridcode": 370,
        "zone": "zone4"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [...]
      }
    }
  ]
}
```

## Monitoring and Verification

### Health Checks
- `/collections` - Should show only clean collections
- `/collections/public.geofsm_zones/items` - Should return readable GeoJSON
- `/collections/public.geofsm_zones/tiles/0/0/0` - Should serve vector tiles
- `/rainfall/zones` - Should show available rainfall data

### Performance Benefits
- Reduced database size (removing wide tables)
- Faster API responses (simpler data structures)
- Better caching (smaller payloads)
- Improved readability for developers

## Summary

The "encoded/long data" issue was caused by different upload methods creating tables with varying complexity:
- **Simple approach**: Essential columns only → Clean, readable data
- **Complex approach**: All columns + time-series → Long, encoded-looking data

**Solution**: Keep only the clean `geofsm_zones` table and remove the complex tables. Use separate time-series data management for optimal performance and readability.

---

**Files Created**:
- `investigate_table_schemas.py` - Analysis tool
- `cleanup_database_tables.py` - Database cleanup script
- `table_schema_analysis_20250709.md` - This documentation

**Next Steps**:
1. Run cleanup script to remove problematic tables
2. Verify collections show only clean data
3. Test API endpoints for proper functionality

Last Updated: July 9, 2025