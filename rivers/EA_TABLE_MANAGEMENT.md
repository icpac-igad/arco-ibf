# East Africa River Networks Table Management

## Overview

After the SSH interruption during upload, use these scripts to check, clean, and resume the `ea_river_networks_tdx` table upload.

## Scripts Available

### 1. `check_and_clean_ea_table.py` - Table Diagnostics & Cleanup
**Interactive menu system for table management**

#### Features:
- **Table diagnostics**: Complete health check with feature counts, VPU breakdown, data quality
- **Missing VPU detection**: Identify which VPUs failed to upload
- **Data cleanup**: Remove duplicates, fix invalid geometries, add missing style attributes
- **Index management**: Create missing indexes for TIPG performance
- **Table operations**: Drop table if needed for fresh start

#### Usage:
```bash
# Set database connection
export DATABASE_URL="postgresql://user:password@host:port/database"

# Run interactive menu
python check_and_clean_ea_table.py
```

#### Menu Options:
```
1. Check table diagnostics          - Full health check
2. Check missing VPUs              - Which VPUs are missing
3. Compare expected vs actual      - GPKG vs database counts
4. Clean table                     - Fix data issues
5. Create missing indexes          - Optimize for TIPG
6. Drop table completely           - Fresh start
7. Exit
```

### 2. `resume_ea_upload.py` - Resume Interrupted Upload
**Smart resume that only uploads missing VPUs**

#### Features:
- **Automatic detection**: Identifies which VPUs are missing from database
- **Status reporting**: Shows current upload progress and missing data
- **Selective upload**: Only uploads VPUs that are missing
- **Progress tracking**: Shows upload progress for each VPU
- **Index creation**: Automatically creates TIPG-optimized indexes

#### Usage:
```bash
# Set database connection
export DATABASE_URL="postgresql://user:password@host:port/database"

# Resume upload
python resume_ea_upload.py
```

## Common Scenarios

### Scenario 1: Check Upload Status
```bash
python check_and_clean_ea_table.py
# Select option 1 for diagnostics
# Select option 2 to check missing VPUs
```

**Example Output:**
```
EA RIVER NETWORKS TABLE DIAGNOSTICS
==================================================
Table: ea_river_networks_tdx
Total features: 156,234
VPU regions: 5
Stream orders: 2-9
Table size: 42 MB

VPU BREAKDOWN:
  VPU 101: 19,103 features (orders 2-8)
  VPU 102: 48,859 features (orders 2-7)
  VPU 103: 78,718 features (orders 2-9)
  Missing VPUs: [106, 109, 120, 122, 126]
```

### Scenario 2: Resume Interrupted Upload
```bash
python resume_ea_upload.py
```

**Example Output:**
```
EA RIVER NETWORKS UPLOAD STATUS
===============================
✅ Table exists
📊 Current features: 156,234
🗺️ VPU regions: 5

✅ Completed VPUs (5):
  VPU 101: 19,103 features
  VPU 102: 48,859 features
  VPU 103: 78,718 features

❌ Missing VPUs (5):
  [106, 109, 120, 122, 126]

Ready to upload 5 missing VPUs:
  VPU 106: 1,405 expected features
  VPU 109: 9,078 expected features
  VPU 120: 12,413 expected features
  VPU 122: 146,286 expected features
  VPU 126: 3,921 expected features

Proceed with upload? (y/N):
```

### Scenario 3: Clean Partial Upload Issues
```bash
python check_and_clean_ea_table.py
# Select option 4 for cleaning
```

**Fixes:**
- **Duplicate features**: Removes duplicate linkno entries
- **Invalid geometries**: Fixes using ST_MakeValid()
- **Missing style attributes**: Adds style_width and style_color
- **Data type issues**: Ensures proper column types

### Scenario 4: Fresh Start
```bash
python check_and_clean_ea_table.py
# Select option 6 to drop table
# Then run original upload script
python upload_ea_river_networks.py
```

## Expected Final Results

### Complete Upload Should Show:
```
Total features: 319,783
VPU regions: 8

VPU BREAKDOWN:
  VPU 101: 19,103 features
  VPU 102: 48,859 features  
  VPU 103: 78,718 features
  VPU 106: 1,405 features
  VPU 109: 9,078 features
  VPU 120: 12,413 features
  VPU 122: 146,286 features
  VPU 126: 3,921 features

STREAM ORDER DISTRIBUTION:
  Order 2: ~160,000 streams (50.1%)
  Order 3: ~95,000 streams (29.7%)
  Order 4: ~42,000 streams (13.1%)
  Order 5: ~15,000 streams (4.7%)
  Order 6: ~6,000 streams (1.9%)
  Order 7+: ~2,000 streams (0.6%)

DATA QUALITY:
  linkno: 319783/319783 (100.0%) ✅
  stream_order: 319783/319783 (100.0%) ✅
  geometry: 319783/319783 (100.0%) ✅
  valid_geometries: 319783/319783 (100.0%) ✅
  style_width: 319783/319783 (100.0%) ✅
  style_color: 319783/319783 (100.0%) ✅

INDEXES:
  idx_ea_river_networks_tdx_geom (spatial)
  idx_ea_river_networks_tdx_stream_order
  idx_ea_river_networks_tdx_vpu_code
  idx_ea_river_networks_tdx_linkno
  idx_ea_river_networks_tdx_length_cat
```

## Database Queries for Manual Checking

### Check Upload Progress
```sql
-- Total features and VPU count
SELECT 
    COUNT(*) as total_features,
    COUNT(DISTINCT vpu_code) as vpu_count
FROM ea_river_networks_tdx;

-- VPU breakdown
SELECT 
    vpu_code, 
    COUNT(*) as feature_count,
    MIN(stream_order) as min_order,
    MAX(stream_order) as max_order
FROM ea_river_networks_tdx
GROUP BY vpu_code
ORDER BY vpu_code;
```

### Check Data Quality
```sql
-- Missing or null values
SELECT 
    COUNT(*) as total_rows,
    COUNT(linkno) as valid_linkno,
    COUNT(stream_order) as valid_stream_order,
    COUNT(CASE WHEN ST_IsValid(geometry) THEN 1 END) as valid_geometries
FROM ea_river_networks_tdx;

-- Duplicate linkno values
SELECT linkno, COUNT(*) 
FROM ea_river_networks_tdx 
GROUP BY linkno 
HAVING COUNT(*) > 1;
```

### Check Indexes
```sql
-- List all indexes on the table
SELECT indexname, indexdef
FROM pg_indexes 
WHERE tablename = 'ea_river_networks_tdx'
ORDER BY indexname;
```

## TIPG Integration After Cleanup

### Test TIPG Endpoints
```bash
# Collections list
curl http://localhost:8000/collections

# River networks collection info
curl http://localhost:8000/collections/public.ea_river_networks_tdx

# Sample features
curl "http://localhost:8000/collections/public.ea_river_networks_tdx/items?limit=5"

# Vector tiles (zoom 5, tile 16,12)
curl "http://localhost:8000/collections/public.ea_river_networks_tdx/tiles/5/16/12"
```

### Expected TIPG Collection Response
```json
{
  "id": "public.ea_river_networks_tdx",
  "title": "ea_river_networks_tdx", 
  "description": "East Africa river networks from TanDEM-X",
  "extent": {
    "spatial": {
      "bbox": [[21.85, -11.74, 51.27, 23.15]]
    }
  },
  "links": [
    {
      "rel": "items",
      "href": "/collections/public.ea_river_networks_tdx/items"
    },
    {
      "rel": "tiles", 
      "href": "/collections/public.ea_river_networks_tdx/tiles/{tileMatrixSetId}/{tileMatrix}/{tileRow}/{tileCol}"
    }
  ]
}
```

## Troubleshooting

### Issue: "Table does not exist"
**Solution**: Run resume script to create table and upload all VPUs
```bash
python resume_ea_upload.py
```

### Issue: "Duplicate linkno values"
**Solution**: Use cleanup script to remove duplicates
```bash
python check_and_clean_ea_table.py
# Select option 4 (Clean table)
```

### Issue: "Missing style attributes"
**Solution**: Cleanup script will add missing style_width and style_color
```bash
python check_and_clean_ea_table.py
# Select option 4 (Clean table)
```

### Issue: "Slow TIPG performance"
**Solution**: Ensure all indexes are created
```bash
python check_and_clean_ea_table.py
# Select option 5 (Create missing indexes)
```

### Issue: "Invalid geometries"
**Solution**: Cleanup script will fix using ST_MakeValid()
```bash
python check_and_clean_ea_table.py
# Select option 4 (Clean table)
```

## Files Summary

| File | Purpose | Usage |
|------|---------|-------|
| `check_and_clean_ea_table.py` | Interactive diagnostics & cleanup | Check status, fix issues |
| `resume_ea_upload.py` | Resume interrupted upload | Upload missing VPUs only |
| `upload_ea_river_networks.py` | Original full upload script | Fresh start uploads |
| `EA_TABLE_MANAGEMENT.md` | This documentation | Reference guide |

## Best Practices

1. **Always check status first**: Use diagnostics before making changes
2. **Backup before cleanup**: Consider exporting table before major cleanup
3. **Test TIPG after changes**: Verify endpoints work after modifications
4. **Monitor upload progress**: Watch logs during resume operations
5. **Verify final counts**: Compare with expected counts from GPKG files

The management scripts provide comprehensive tools to handle any issues from the interrupted SSH upload and ensure a complete, clean `ea_river_networks_tdx` table for TIPG vector tile serving.