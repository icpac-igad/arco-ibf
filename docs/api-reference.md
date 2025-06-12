# API Reference

## Base URL
```
http://localhost:5000
```

## Core Endpoints

### Landing Page
```http
GET /
```
Returns the API landing page with links to all available endpoints.

**Response Example**:
```json
{
  "title": "TiPg: OGC Features and Tiles API",
  "description": "A modern Python implementation of OGC Features and Tiles API",
  "links": [
    {
      "href": "http://localhost:5000/",
      "rel": "self",
      "type": "application/json",
      "title": "Landing page"
    },
    {
      "href": "http://localhost:5000/conformance",
      "rel": "conformance",
      "type": "application/json",
      "title": "Conformance declaration"
    }
  ]
}
```

### Conformance Declaration
```http
GET /conformance
```
Lists the OGC API standards this server conforms to.

**Response Example**:
```json
{
  "conformsTo": [
    "http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core",
    "http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/oas30",
    "http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/html",
    "http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson",
    "http://www.opengis.net/spec/ogcapi-tiles-1/1.0/conf/core"
  ]
}
```

## Collections API

### List Collections
```http
GET /collections
```
Returns all available spatial data collections.

**Response Example**:
```json
{
  "collections": [
    {
      "id": "public.landsat_wrs",
      "title": "Landsat WRS",
      "description": "Landsat Worldwide Reference System grid",
      "extent": {
        "spatial": {
          "bbox": [[-180.0, -82.6, 180.0, 82.6]],
          "crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"
        }
      },
      "links": [
        {
          "href": "http://localhost:5000/collections/public.landsat_wrs",
          "rel": "self",
          "type": "application/json"
        }
      ]
    }
  ]
}
```

### Get Collection Metadata
```http
GET /collections/{collectionId}
```

**Parameters**:
- `collectionId`: Collection identifier (e.g., `public.landsat_wrs`)

**Response Example**:
```json
{
  "id": "public.landsat_wrs",
  "title": "Landsat WRS",
  "description": "Landsat Worldwide Reference System grid",
  "extent": {
    "spatial": {
      "bbox": [[-180.0, -82.6, 180.0, 82.6]],
      "crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"
    }
  },
  "itemType": "feature",
  "crs": ["http://www.opengis.net/def/crs/OGC/1.3/CRS84"]
}
```

### Get Collection Queryables
```http
GET /collections/{collectionId}/queryables
```
Returns the queryable properties for a collection.

**Response Example**:
```json
{
  "type": "object",
  "title": "public.landsat_wrs",
  "properties": {
    "ogc_fid": {
      "title": "ogc_fid",
      "type": "integer"
    },
    "id": {
      "title": "id",
      "type": "string"
    },
    "pr": {
      "title": "pr",
      "type": "string"
    }
  }
}
```

## Features API

### Get Features
```http
GET /collections/{collectionId}/items
```

**Query Parameters**:
- `limit`: Maximum number of features to return (default: 10, max: 10000)
- `bbox`: Bounding box filter (comma-separated: minx,miny,maxx,maxy)
- `f`: Output format (`json`, `csv`, `geojsonseq`)
- `properties`: Comma-separated list of properties to include

**Examples**:
```http
# Get 5 features
GET /collections/public.my_data/items?limit=5

# Spatial filter with bounding box
GET /collections/public.my_data/items?bbox=-74.1,40.6,-73.9,40.9

# CSV output format
GET /collections/public.my_data/items?f=csv&limit=10

# Select specific properties
GET /collections/public.my_data/items?properties=ogc_fid,name&limit=5
```

**GeoJSON Response Example**:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[-47.536, 74.805], [-8.974, 81.856], ...]]
      },
      "properties": {
        "ogc_fid": 1,
        "id": "0",
        "datetime": "2004-10-19T10:23:54",
        "decimal": 1.25
      }
    }
  ],
  "links": [],
  "numberMatched": 6,
  "numberReturned": 1
}
```

### Get Single Feature
```http
GET /collections/{collectionId}/items/{featureId}
```

**Parameters**:
- `collectionId`: Collection identifier
- `featureId`: Feature identifier

**Response**: Single GeoJSON Feature object

## Tiles API

### Get Vector Tile
```http
GET /collections/{collectionId}/tiles/{tileMatrixSetId}/{z}/{x}/{y}
```

**Parameters**:
- `collectionId`: Collection identifier
- `tileMatrixSetId`: Tile matrix set (e.g., `WebMercatorQuad`)
- `z`: Zoom level (0-22)
- `x`: Tile column
- `y`: Tile row

**Query Parameters**:
- `properties`: Comma-separated list of properties to include in tile

**Examples**:
```http
# World overview tile
GET /collections/public.landsat_wrs/tiles/WebMercatorQuad/0/0/0

# Higher zoom level
GET /collections/public.my_data/tiles/WebMercatorQuad/10/512/512

# Tile with specific properties
GET /collections/public.my_data/tiles/WebMercatorQuad/5/16/16?properties=ogc_fid,name
```

**Response**: Mapbox Vector Tile (MVT) binary data
- Content-Type: `application/vnd.mapbox-vector-tile`
- Encoding: Protobuf
- Status: 200 (with data) or 204 (no content)

### List Tilesets
```http
GET /collections/{collectionId}/tilesets
```
Returns available tilesets for a collection.

**Response Example**:
```json
{
  "tilesets": [
    {
      "id": "WebMercatorQuad",
      "title": "Web Mercator Quad",
      "links": [
        {
          "href": "http://localhost:5000/collections/public.my_data/tilesets/WebMercatorQuad",
          "rel": "self",
          "type": "application/json"
        }
      ]
    }
  ]
}
```

### Get TileJSON
```http
GET /collections/{collectionId}/tilesets/{tileMatrixSetId}
```
Returns TileJSON specification for the tileset.

**Response Example**:
```json
{
  "tilejson": "3.0.0",
  "name": "public.my_data",
  "tiles": [
    "http://localhost:5000/collections/public.my_data/tiles/WebMercatorQuad/{z}/{x}/{y}"
  ],
  "minzoom": 0,
  "maxzoom": 22,
  "bounds": [-47.536, 74.805, -8.974, 81.856],
  "center": [-28.255, 78.3055, 0]
}
```

## Tile Matrix Sets

### List Tile Matrix Sets
```http
GET /tileMatrixSets
```
Returns all available tile matrix sets.

**Response Example**:
```json
{
  "tileMatrixSets": [
    {
      "id": "WebMercatorQuad",
      "title": "Web Mercator Quad",
      "links": [
        {
          "href": "http://localhost:5000/tileMatrixSets/WebMercatorQuad",
          "rel": "self",
          "type": "application/json"
        }
      ]
    }
  ]
}
```

### Get Tile Matrix Set Definition
```http
GET /tileMatrixSets/{tileMatrixSetId}
```
Returns the complete definition of a tile matrix set.

## HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 204 | No Content (empty tile) |
| 400 | Bad Request (invalid parameters) |
| 404 | Not Found (collection/feature doesn't exist) |
| 422 | Unprocessable Entity (invalid tile coordinates) |
| 500 | Internal Server Error |

## Output Formats

### GeoJSON (default)
```http
Accept: application/geo+json
```
Standard GeoJSON format for features.

### CSV
```http
Accept: text/csv
```
or
```http
GET /collections/{collectionId}/items?f=csv
```
Comma-separated values with geometry as WKT.

### GeoJSONSeq
```http
Accept: application/geo+json-seq
```
or
```http
GET /collections/{collectionId}/items?f=geojsonseq
```
Newline-delimited GeoJSON features.

## Client Libraries

### JavaScript (Leaflet)
```javascript
// Vector tiles with Leaflet
const map = L.map('map').setView([40.7128, -74.0060], 10);

// Add vector tile layer
L.vectorGrid.protobuf('http://localhost:5000/collections/public.my_data/tiles/WebMercatorQuad/{z}/{x}/{y}', {
  vectorTileLayerStyles: {
    'public.my_data': {
      color: 'red',
      weight: 2
    }
  }
}).addTo(map);
```

### JavaScript (MapLibre GL JS)
```javascript
// Vector tiles with MapLibre GL JS
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      'my-data': {
        type: 'vector',
        tiles: ['http://localhost:5000/collections/public.my_data/tiles/WebMercatorQuad/{z}/{x}/{y}']
      }
    },
    layers: [{
      id: 'my-data-layer',
      type: 'fill',
      source: 'my-data',
      'source-layer': 'public.my_data',
      paint: {
        'fill-color': '#088',
        'fill-opacity': 0.8
      }
    }]
  }
});
```

### Python (requests)
```python
import requests

# Get features
response = requests.get('http://localhost:5000/collections/public.my_data/items?limit=10')
features = response.json()

# Get vector tile
tile_response = requests.get('http://localhost:5000/collections/public.my_data/tiles/WebMercatorQuad/10/512/512')
mvt_data = tile_response.content
```

## Rate Limiting and Caching

### Cache Headers
Vector tiles include appropriate cache headers:
```http
Cache-Control: public, max-age=3600
ETag: "abc123"
```

### Rate Limiting
Configure rate limiting in production:
- Feature requests: 100/minute per IP
- Tile requests: 1000/minute per IP
- Bulk operations: 10/minute per IP