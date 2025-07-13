# TiPG Choropleth Visualization Application

This Flask application demonstrates the integration of **TiPG (Tile-based Geospatial Processing)** vector tile endpoints with time series rainfall data from text files, creating an interactive choropleth map visualization.

## Features

- **TiPG Integration**: Fetches geospatial vector data from TiPG endpoints
- **Time Series Data**: Loads rainfall data from zone*_rain.txt files
- **Interactive Map**: MapLibre GL JS for smooth map interactions
- **Choropleth Visualization**: Color-coded rainfall intensity mapping
- **Date Selection**: Navigate through historical rainfall data
- **Real-time Statistics**: Dynamic calculation of rainfall statistics
- **Responsive Design**: Works on desktop and mobile devices

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   TiPG Server   │    │ Flask App       │    │   Frontend      │
│  (Vector Data)  │◄──►│ (Data Fusion)   │◄──►│ (MapLibre +     │
│                 │    │                 │    │  Visualization) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │ Zone Rain Files │
                       │ (Time Series)   │
                       └─────────────────┘
```

## Key Components

### 1. Data Integration
- **Vector Data**: Retrieved from TiPG endpoints (`/collections/public.geofsm_zones/items`)
- **Time Series Data**: Parsed from zone*_rain.txt files with YYYY001 date format
- **Data Fusion**: Combines spatial polygons with rainfall values by gridcode

### 2. API Endpoints
- `GET /` - Main application interface
- `GET /api/rainfall/{date}` - Combined spatial and rainfall data for a specific date
- `GET /api/dates` - Available dates in the dataset
- `GET /api/summary/{date}` - Statistical summary for a specific date

### 3. Frontend Technology
- **MapLibre GL JS**: For vector tile rendering and map interactions
- **Responsive Design**: Sidebar with controls and full-screen map
- **Color Coding**: Rainfall intensity visualization with legend

## Installation & Setup

1. **Install Dependencies**:
   ```bash
   pip install -r requirements_choropleth.txt
   ```

2. **Ensure Data Files Exist**:
   - `zone1_rain.txt` through `zone6_rain.txt`
   - TiPG server running at the configured endpoint

3. **Run the Application**:
   ```bash
   python tipg_choropleth_app.py
   ```

4. **Access the Application**:
   - Open browser to `http://localhost:5001`
   - Select a date from the dropdown
   - Explore the interactive map

## Data Format

### Zone Rain Files Format
```
NA,44,46,50,14,53,58,15,18,62,25,69,26,70,28,73,52,76,30,55,61,8,54,79,5,33,64,82,4,23,27,81,65,48,60,42,9,63,32,37,36,24,16,3,86,39,85,17,47,71,84,29,45,31,77,72,74,35,12,49,43,67,22,34,56,57,19,59,20,41,78,83,1,80,68,75,66,11,51,2,21,7,6,13,40,38,10
2011001,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
2011002,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
```

- **First line**: Grid codes (column headers)
- **Subsequent lines**: Date (YYYY001 format) followed by rainfall values

### TiPG Response Format
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [...]
      },
      "properties": {
        "gridcode": 1,
        "zone": "zone1",
        "rainfall": 0.0,
        "date": "2011001",
        "readable_date": "2011-01-01"
      }
    }
  ]
}
```

## Visualization Features

### Rainfall Color Scale
- **No Rain**: Light blue (#e3f2fd)
- **Light Rain** (0.1-2.5mm): Blue (#bbdefb)
- **Moderate Rain** (2.6-7.5mm): Medium blue (#90caf9)
- **Heavy Rain** (7.6-35mm): Dark blue (#64b5f6)
- **Very Heavy Rain** (35.1-70mm): Darker blue (#42a5f5)
- **Extreme Rain** (>70mm): Darkest blue (#2196f3)

### Interactive Features
- **Click on polygons**: View detailed rainfall information
- **Date selection**: Navigate through time series data
- **Zoom and pan**: Explore different regions
- **Statistics panel**: Real-time data summaries

## Technical Details

### Date Parsing
The application converts YYYY001 format (year + day of year) to readable dates:
- `2011001` → `2011-01-01` (January 1st, 2011)
- `2011032` → `2011-02-01` (February 1st, 2011)
- `2011365` → `2011-12-31` (December 31st, 2011)

### Performance Optimizations
- **Data caching**: Zone files loaded once on startup
- **Efficient querying**: Direct gridcode-to-rainfall mapping
- **Vector tiles**: Efficient rendering of large polygon datasets
- **Responsive design**: Optimized for various screen sizes

## Example Usage

1. **Start the application**
2. **Select a date** from the dropdown (e.g., "2011001")
3. **View the map** with rainfall data overlaid on polygons
4. **Click on regions** to see detailed information
5. **Check statistics** in the sidebar for data summaries

This application effectively demonstrates how TiPG can be integrated with external time series data to create powerful geospatial visualizations without requiring all data to be stored in the same database.