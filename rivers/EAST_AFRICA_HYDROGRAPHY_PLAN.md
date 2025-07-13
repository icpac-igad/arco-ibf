# East Africa Hydrography Processing Plan for Vector Tile Visualization

## Overview
This document outlines the plan to process hydrography data for river network visualization using TIPG vector tiles (https://github.com/developmentseed/tipg). The goal is to create an interactive web map showing river networks with relative width styling based on stream order, similar to the screenshot provided.

**Key Objectives:**
- Visualize river networks with relative width styling in web maps
- Upload processed data to PostgreSQL database with PostGIS extension
- Use TIPG vector tiles for fast, scalable web visualization
- Focus on efficient, smaller datasets rather than large bulk downloads

## Context

Following the GEOGloWS Streamflow project's v2 release and their impressive global river flow simulation system built on TDX-Hydro data, there's an opportunity to build upon their AWS Open Data Registry datasets.

**GEOGloWS v2 Benefits:**
- Modified TDX-Hydro streams with added attributes (topological order)
- Simplified headwater streamlines optimized for web mapping
- Data available on AWS S3 with public access
- Pre-processed datasets organized by Vector Processing Units (VPUs)
- Significantly smaller file sizes compared to raw NGA data

## Background
- The project uses TDX-Hydro data organized by HydroBASINS Level 2 boundaries
- East Africa corresponds to HYBAS_ID/TDXHydroRegion: **1020011530** (PFAF_ID: 12)
- The existing notebooks demonstrate processing for global data
- Need to adapt the workflow for East Africa region specifically

## Data Sources

### Primary: GEOGLOWS v2 AWS S3 Bucket (Recommended)
- **Bucket**: `s3://geoglows-v2` (us-west-2 region, public access)
- **Benefits**: Smaller files, web-optimized, pre-processed with topological attributes
- **Relevant files for East Africa**:
  - `streams/streams_104.gpkg` (~193MB) - East Africa region streams
  - `streams-global/global_streams_simplified.gpkg` - Simplified global dataset
  - `streams-global/geoglows-v2-map-optimized.gdb.zip` (~1.98GB) - Web visualization optimized
  - `tables/v2-master-table.parquet` (~245MB) - Metadata without geometry

### Supporting Data
- **HydroBASINS Level 2**: Continental sub-unit boundaries (already downloaded)

## Revised Processing Strategy for Vector Tiles

### Phase 1: Data Acquisition from AWS S3
1. **Access GEOGLOWS v2 S3 Bucket**
   ```python
   import s3fs
   bucket_uri = 's3://geoglows-v2'
   s3 = s3fs.S3FileSystem(anon=True, client_kwargs=dict(region_name='us-west-2'))
   ```

2. **Download East Africa Stream Data**
   - Correct VPU numbers for East Africa: **101, 102, 103, 106, 109, 120, 122, 126**
   - Correct S3 path: `hydrography/vpu=NUMBER/streams_NUMBER.gpkg`
   - Example: VPU 101 contains 38,173 stream reaches (257MB)
   - Already includes web-optimized geometries and attributes

3. **Alternative: Use Simplified Global Dataset**
   - `streams-global/global_streams_simplified.gpkg` for broader coverage
   - Pre-simplified geometries for faster web rendering

### Phase 2: Data Optimization for Vector Tiles
1. **Geometric Simplification (Optional)**
   ```python
   import topojson as tp
   topo = tp.Topology(data=gdf, prequantize=False)
   simplified_gdf = topo.toposimplify(
       epsilon=0.0001,  # tolerance in degrees
       simplify_with='simplification',
       simplify_algorithm='dp'
   ).to_gdf()
   ```

2. **Convert to Efficient Formats**
   - Save as GeoParquet with compression for intermediate storage
   - 4-5x smaller files than GPKG
   - Faster read/write operations

3. **Prepare Attributes for Styling**
   - Stream order (strmOrder): 1-9 for width styling
   - Stream length (LengthGeodesicMeters): for length-based filtering
   - Contributing area (DSContArea): for importance ranking
   - VPU Code: for regional filtering

### Phase 3: Database Integration and Vector Tiles
1. **PostgreSQL/PostGIS Setup**
   - Create spatial database with PostGIS extension
   - Import processed stream data with spatial indexing
   - Set up appropriate table structure for TIPG

2. **TIPG Configuration**
   - Configure vector tile server pointing to PostGIS database
   - Set up zoom-dependent styling based on stream order
   - Implement relative width styling: `width = baseWidth * Math.pow(streamOrder, scaleFactor)`

3. **Web Visualization**
   - Stream width proportional to stream order
   - Color coding by stream importance or flow characteristics
   - Interactive features for stream network exploration

## Technical Implementation

### Environment Setup
- Use existing `myenv` environment with micromamba
- Key dependencies: geopandas, pyogrio, networkx, pyarrow

### Data Pipeline for Vector Tiles

```
data_temp/
├── geoglows-v2/               # AWS S3 downloaded data
│   ├── streams/
│   │   └── streams_104.gpkg   # East Africa streams (~193MB)
│   └── processed/
│       ├── streams_104_optimized.parquet    # Compressed format
│       ├── streams_104_simplified.parquet   # Geometric simplification
│       └── streams_104_styled.gpkg          # Ready for TIPG
└── database/
    └── tipg_ready/            # Files ready for PostGIS import
        ├── east_africa_streams.sql
        └── stream_styling.json
```

### Performance Optimizations
1. **File Size Comparison**:
   - GEOGLOWS S3 GPKG: ~193MB (manageable)
   - Compressed Parquet: ~43MB (4.5x smaller)
   - Simplified Parquet: ~25MB (additional 2x reduction)

2. **Read Performance**:
   - S3 GPKG read: ~1.5 minutes
   - Local Parquet read: ~1-3 seconds
   - Simplified geometries: 2-3x faster rendering

### Key Libraries and Tools
1. **Data Access**: `s3fs` for AWS S3 integration
2. **Geometry Processing**: `pyogrio`, `geopandas` for spatial data
3. **Simplification**: `topojson` for topology-preserving simplification  
4. **Database**: `psycopg2` for PostgreSQL/PostGIS integration
5. **Vector Tiles**: TIPG server configuration

## Expected Outputs

### 1. Vector Tile Ready Dataset
- **Stream Network**: ~27,579 stream reaches (East Africa region)
- **Key Attributes**:
  - `LINKNO`: Unique stream reach identifier  
  - `strmOrder`: Strahler stream order (1-9) for width styling
  - `LengthGeodesicMeters`: Stream reach length
  - `DSContArea`: Downstream contributing area
  - `VPUCode`: Vector Processing Unit code

### 2. Database Schema for TIPG
- **PostGIS Table**: `east_africa_streams`
- **Spatial Index**: On geometry column for fast queries
- **Styling Configuration**: JSON for zoom-dependent rendering

### 3. Web Visualization Features
- **Relative Width Styling**: Stream width proportional to stream order
- **Interactive Features**: Click/hover for stream attributes
- **Performance**: Fast loading via vector tiles
- **Scalability**: Zoom-dependent detail levels

## Implementation Roadmap

### Phase 1: Data Acquisition (Immediate)
1. Download streams_104.gpkg from GEOGLOWS S3 bucket
2. Explore existing notebooks for AWS S3 access patterns
3. Test data loading and basic visualization

### Phase 2: Data Processing (Short Term)  
1. Apply geometric simplification if needed
2. Convert to efficient storage formats (Parquet)
3. Prepare styling attributes for vector tiles

### Phase 3: Database Integration (Medium Term)
1. Set up PostgreSQL with PostGIS extension
2. Import processed stream data with spatial indexing
3. Configure TIPG vector tile server

### Phase 4: Web Visualization (Final Goal)
1. Implement relative width styling based on stream order
2. Test interactive features and performance
3. Document complete workflow for replication
