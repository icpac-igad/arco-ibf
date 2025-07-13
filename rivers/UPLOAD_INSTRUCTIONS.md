# East Africa River Networks Upload Instructions

## Overview

The `resume_ea_upload_v2.py` script uploads all East Africa GPKG files to a single PostgreSQL table (`ea_river_networks_tdx_v2`) for use with TIPG vector tiles.

## Prerequisites

### 1. PostgreSQL Database with PostGIS
Ensure you have a PostgreSQL database with PostGIS extension:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 2. Database Connection
Set the DATABASE_URL environment variable:
```bash
export DATABASE_URL="postgresql://username:password@hostname:port/database_name"
```

Example:
```bash
export DATABASE_URL="postgresql://tipg_user:your_password@localhost:5432/tipg_db"
```

### 3. Python Dependencies
Install required packages:
```bash
pip install geopandas sqlalchemy psycopg2-binary
```

## Execution

### Run the Upload Script
```bash
cd global-hydrography
python upload_ea_river_networks.py
```

## What the Script Does

### 1. Data Processing
- **Loads all 8 VPU GPKG files**: `east_africa_streams_101.gpkg` to `east_africa_streams_126.gpkg`
- **Combines into single table**: `ea_river_networks_tdx`
- **Cleans column names**: Following TIPG best practices
- **Optimizes data types**: For better performance
- **Adds styling attributes**: For TIPG visualization

### 2. Table Schema
The resulting table will have these columns:

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer | Primary key (auto-generated) |
| `linkno` | integer | Unique river reach identifier |
| `stream_order` | smallint | Stream order (1-7) for styling |
| `length_m` | real | Length in meters |
| `length_km` | real | Length in kilometers |
| `vpu_code` | smallint | VPU region code (101-126) |
| `drainage_area_km2` | real | Upstream drainage area |
| `hydro_region` | bigint | TDX hydrological region |
| `topo_order` | integer | Topological order |
| `style_width` | real | Line width for rendering (0.5-4.0) |
| `style_color` | text | Color category (minor/medium/major/primary) |
| `length_category` | text | Length category (short/medium/long/very_long) |
| `geometry` | geometry | LineString geometry (WGS84) |

### 3. Database Indexes
Creates optimized indexes for TIPG performance:
- **Spatial index**: `GIST` on geometry column
- **Stream order index**: For zoom-level filtering
- **VPU code index**: For regional filtering  
- **Link number index**: For unique identification
- **Length category index**: For filtering by stream size

## Expected Results

### Data Volume
```
Total Features: ~319,783 East Africa stream reaches
VPU Breakdown:
  VPU 101: 19,103 features (Ethiopia, South Sudan NE)
  VPU 102: 48,859 features (Ethiopia, Sudan, South Sudan Central)  
  VPU 103: 78,718 features (Sudan, South Sudan, Ethiopia Western)
  VPU 106: 1,405 features (Somalia, Kenya small portion)
  VPU 109: 9,078 features (Kenya, Tanzania, Uganda small portion)
  VPU 120: 12,413 features (Tanzania, Uganda, Rwanda, Burundi)
  VPU 122: 146,286 features (Kenya, Tanzania, Uganda main)
  VPU 126: 3,921 features (Djibouti, Eritrea, Ethiopia Eastern)
```

### Stream Order Distribution
```
Order 2: ~110,000 streams (minor tributaries)
Order 3: ~108,000 streams (medium streams)
Order 4: ~50,000 streams (larger streams)  
Order 5: ~24,000 streams (rivers)
Order 6: ~13,000 streams (major rivers)
Order 7+: ~15,000 streams (primary rivers)
```

## TIPG Configuration

The script creates `ea_river_networks_tipg_config.json` with optimized settings:

### Zoom-Level Filtering
- **Zoom 0-5**: Show only order 6+ rivers (major rivers)
- **Zoom 6-8**: Show order 4+ rivers (larger streams) 
- **Zoom 9-11**: Show order 2+ rivers (medium streams)
- **Zoom 12-16**: Show all rivers (including small tributaries)

### Styling Configuration
- **Line width**: Based on `style_width` column (0.5-4.0 pixels)
- **Line color**: Based on `style_color` column
  - `minor`: Light blue (#87CEEB)
  - `medium`: Steel blue (#4682B4) 
  - `major`: Dodge blue (#1E90FF)
  - `primary`: Medium blue (#0000CD)

## Testing TIPG Integration

### 1. Start TIPG Server
```bash
tipg --database-url $DATABASE_URL
```

### 2. Test Endpoints

#### Collections List
```bash
curl http://localhost:8000/collections
```

#### River Networks Collection
```bash
curl http://localhost:8000/collections/public.ea_river_networks_tdx
```

#### Sample Data
```bash
curl "http://localhost:8000/collections/public.ea_river_networks_tdx/items?limit=10"
```

#### Vector Tiles
```bash
curl "http://localhost:8000/collections/public.ea_river_networks_tdx/tiles/5/16/12"
```

## Troubleshooting

### Common Issues

1. **DATABASE_URL not set**
   ```bash
   export DATABASE_URL="postgresql://user:pass@host:port/db"
   ```

2. **PostGIS extension missing**
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

3. **Permission errors**
   - Ensure database user has CREATE TABLE permissions
   - Check connection string format

4. **Memory issues**
   - Script processes VPUs individually to avoid RAM problems
   - Uses garbage collection between uploads

### Verification Queries

Check upload success:
```sql
-- Total features
SELECT COUNT(*) FROM ea_river_networks_tdx;

-- VPU breakdown  
SELECT vpu_code, COUNT(*) 
FROM ea_river_networks_tdx 
GROUP BY vpu_code 
ORDER BY vpu_code;

-- Stream order distribution
SELECT stream_order, COUNT(*) 
FROM ea_river_networks_tdx 
GROUP BY stream_order 
ORDER BY stream_order;

-- Spatial extent
SELECT ST_Extent(geometry) FROM ea_river_networks_tdx;
```

## Files Created

1. **`upload_ea_river_networks.py`** - Main upload script
2. **`ea_river_networks_tipg_config.json`** - TIPG configuration
3. **`UPLOAD_INSTRUCTIONS.md`** - This documentation

## Next Steps After Upload

1. **Configure TIPG**: Use the generated configuration file
2. **Test vector tiles**: Verify tile generation at different zoom levels  
3. **Set up styling**: Apply stream order based styling in your map
4. **Performance testing**: Test with different filtering parameters
5. **Monitoring**: Set up logging for tile request performance

The upload process creates a production-ready river networks dataset optimized for TIPG vector tile serving with proper indexing, clean schema, and zoom-level appropriate filtering.
