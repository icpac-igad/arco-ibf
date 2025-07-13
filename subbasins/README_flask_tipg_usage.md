# Flask TiPG Choropleth Application Usage Guide

This guide demonstrates how to use the Flask application with TiPG vector tile server for choropleth visualization.

## Server Architecture

Based on the `.replit` configuration, the application runs multiple services:

### Port Configuration
- **TiPG Server**: Port 5000 (External: 80) - Vector tile server
- **Flask App**: Port 5001 (External: 3003) - Choropleth web application
- **Other Apps**: Various ports for different visualization components

### Live Endpoints

#### TiPG Vector Tile Server
- **Base URL**: `https://de9bec88-c2cf-4ec2-9eb7-0e1dfa649f4b-00-l6v9yz9c91f.riker.replit.dev`
- **Collection**: `public.geofsm_zones`
- **Items URL**: `https://de9bec88-c2cf-4ec2-9eb7-0e1dfa649f4b-00-l6v9yz9c91f.riker.replit.dev/collections/public.geofsm_zones/items`

#### Flask Choropleth App
- **Local Port**: 5001
- **External Port**: 3003
- **URL**: `https://de9bec88-c2cf-4ec2-9eb7-0e1dfa649f4b-00-l6v9yz9c91f.riker.replit.dev:3003` (if running)

## Using the Flask Application

### 1. Start the Flask App
```bash
python tipg_choropleth_app.py
```

### 2. Access the Web Interface
- Open browser to: `http://localhost:5001` (local)
- Or external URL with port 3003 (if configured)

### 3. API Endpoints

#### Get Available Dates
```bash
curl "http://localhost:5001/api/dates"
```

#### Get Rainfall Data for Specific Date
```bash
curl "http://localhost:5001/api/rainfall/2011001"
```

#### Get Rainfall Summary
```bash
curl "http://localhost:5001/api/summary/2011001"
```

## Using the GeoJSON Download Script

### Basic Usage
```bash
# Download sample data
python download_geojson.py --collection public.geofsm_zones --limit 100 --output zones.geojson

# Download with pagination (all features)
python download_geojson.py --collection public.geofsm_zones --paginate --output all_zones.geojson

# Download with bounding box filter
python download_geojson.py --collection public.geofsm_zones --bbox "-180,-90,180,90" --output filtered_zones.geojson
```

### Script Options
- `--url`: TiPG base URL (default: working replit URL)
- `--collection`: Collection ID (default: public.geofsm_zones)
- `--output`: Output filename (default: downloaded_collection.geojson)
- `--limit`: Maximum features to download (default: 10000)
- `--bbox`: Bounding box filter (minx,miny,maxx,maxy)
- `--paginate`: Download all features using pagination
- `--info`: Show collection information

## Data Structure

### Zone Rain Files
- `zone1_rain.txt` to `zone6_rain.txt`
- Format: First row contains gridcodes, subsequent rows contain date and rainfall values
- Date format: YYYY001 (year + day of year)

### GeoJSON Output
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "gridcode": 1001,
        "id": 1,
        "zone": 1,
        "rainfall": 0.5
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [...]
      }
    }
  ]
}
```

## Integration Example

The Flask app demonstrates:
1. **Vector Data**: Served from TiPG at port 5000
2. **Time Series Data**: Loaded from local text files
3. **Visualization**: MapLibre GL JS + Deck.gl choropleth
4. **API Integration**: RESTful endpoints for data access

## Testing the Setup

1. **Verify TiPG is running**:
   ```bash
   curl "https://de9bec88-c2cf-4ec2-9eb7-0e1dfa649f4b-00-l6v9yz9c91f.riker.replit.dev/collections/public.geofsm_zones/items?limit=1"
   ```

2. **Test Flask app**:
   ```bash
   python tipg_choropleth_app.py
   # Then visit http://localhost:5001
   ```

3. **Download sample data**:
   ```bash
   python download_geojson.py --limit 10 --output test.geojson
   ```

This setup showcases how TiPG can serve vector tiles while external time series data is merged for interactive visualization.