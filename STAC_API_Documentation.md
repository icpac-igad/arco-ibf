# STAC API Data Retrieval Documentation

## Overview
This document explains how the STAC Explorer CLI retrieves data from the STAC API server, including both PySTAC-based and direct HTTP API approaches.

## API Architecture

### STAC Server URL Structure
```
Base URL: https://montandon-eoapi-stage.ifrc.org/stac/
Endpoints:
├── /                          # API root/catalog info
├── /collections               # List all collections (paginated)
├── /collections/{id}          # Specific collection details
├── /collections/{id}/items    # Items in a collection (paginated)
├── /search                    # Cross-collection search endpoint
└── /conformance              # API capabilities
```

## Data Retrieval Methods

### Method 1: PySTAC-Based Approach (Used in CLI)

**Location**: `stac_explorer.py` - `get_items()` method

```python
def get_items(self, collection_id: str, limit: int = 10, bbox: Optional[List[float]] = None) -> List[pystac.Item]:
    items = []
    
    try:
        # Build request parameters
        params = {'limit': limit}
        if bbox:
            params['bbox'] = ','.join(map(str, bbox))
        
        # Direct HTTP request to collection items endpoint
        response = self.session.get(
            f"{self.api_url}/collections/{collection_id}/items",
            params=params
        )
        
        # Parse JSON response
        data = response.json()
        
        # Convert each feature to PySTAC Item object
        for item_data in data['features']:
            item = pystac.Item.from_dict(item_data)
            items.append(item)
            
    except Exception as e:
        logger.error(f"Error getting items: {e}")
    
    return items
```

**How it works**:
1. Makes HTTP GET request to `/collections/{collection_id}/items`
2. Receives GeoJSON FeatureCollection response
3. Converts each feature to PySTAC Item object using `pystac.Item.from_dict()`
4. Returns list of PySTAC Item objects

### Method 2: Direct HTTP API Approach

**Alternative implementation** (more efficient for large queries):

```python
import requests

def get_items_direct(api_url: str, collection_id: str, limit: int = 500):
    """Direct HTTP API approach without PySTAC conversion"""
    
    url = f"{api_url}/collections/{collection_id}/items"
    params = {'limit': limit}
    
    response = requests.get(url, params=params)
    data = response.json()
    
    return data['features']  # Raw GeoJSON features
```

## Response Format

### STAC API Response Structure
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "stac_version": "1.1.0",
      "id": "item-id",
      "geometry": {...},
      "bbox": [...],
      "properties": {
        "datetime": "2025-05-15T19:16:05Z",
        "monty:country_codes": ["KEN"],
        "monty:hazard_codes": ["GH0001"],
        "title": "Event Title",
        ...
      },
      "assets": {...},
      "links": [...],
      "collection": "collection-id"
    }
  ],
  "links": [
    {
      "rel": "next",
      "href": "https://...?offset=500",
      "method": "GET"
    }
  ],
  "numberMatched": 1250,
  "numberReturned": 500
}
```

## Pagination Handling

### Collections Pagination
The CLI handles paginated collection responses:

```python
def get_collections(self) -> List[pystac.Collection]:
    collections = []
    url = f"{self.api_url}/collections"
    
    while url:
        response = self.session.get(url)
        data = response.json()
        
        # Process current page
        for col_data in data['collections']:
            collection = pystac.Collection.from_dict(col_data)
            collections.append(collection)
        
        # Find next page URL
        url = None
        for link in data.get('links', []):
            if link.get('rel') == 'next':
                url = link.get('href')
                break
    
    return collections
```

### Items Pagination
For large item collections, pagination can be implemented:

```python
def get_all_items(api_url: str, collection_id: str):
    """Get all items from a collection with pagination"""
    all_items = []
    url = f"{api_url}/collections/{collection_id}/items"
    
    while url:
        response = requests.get(url)
        data = response.json()
        
        all_items.extend(data['features'])
        
        # Check for next page
        url = None
        for link in data.get('links', []):
            if link.get('rel') == 'next':
                url = link.get('href')
                break
    
    return all_items
```

## Search Endpoint Usage

### Cross-Collection Search
```python
def search_items(api_url: str, country_codes: list, limit: int = 1000):
    """Search across all collections for specific countries"""
    
    search_params = {
        'limit': limit,
        'query': {
            'monty:country_codes': {'in': country_codes}
        }
    }
    
    response = requests.post(
        f"{api_url}/search",
        json=search_params,
        headers={'Content-Type': 'application/json'}
    )
    
    return response.json()
```

## CLI Command Flow

### Example: `python main.py items --collection emdat-events --limit 500`

**Execution Flow**:
1. `main.py` parses command line arguments
2. Creates `STACExplorerCLI` instance with API URL
3. Calls `cli.browse_items('emdat-events', limit=500)`
4. CLI calls `explorer.get_items('emdat-events', limit=500)`
5. Makes HTTP GET to `/collections/emdat-events/items?limit=500`
6. Receives 500 features in GeoJSON format
7. Converts each feature to PySTAC Item object
8. Formats and displays results in table format

**Network Request**:
```http
GET /collections/emdat-events/items?limit=500 HTTP/1.1
Host: montandon-eoapi-stage.ifrc.org
Accept: application/json
User-Agent: STAC-Explorer/1.0
```

**Response Processing**:
```python
# Raw response from API
{
  "type": "FeatureCollection", 
  "features": [...500 items...],
  "numberReturned": 500
}

# Converted to PySTAC objects
items = [pystac.Item.from_dict(feature) for feature in data['features']]

# Displayed in CLI table format
+----------+----------+----------+----------+
| ID       | Title    | DateTime | Assets   |
+----------+----------+----------+----------+
| item-1   | Event 1  | 2025...  | 2        |
| ...      | ...      | ...      | ...      |
+----------+----------+----------+----------+
```

## Performance Considerations

### Direct HTTP vs PySTAC
- **Direct HTTP**: Faster for large datasets, returns raw JSON
- **PySTAC conversion**: Slower but provides object-oriented interface with validation

### Optimization Strategies
1. **Limit parameters**: Use appropriate limits (default 10, max varies by server)
2. **Pagination**: Implement for complete datasets
3. **Selective fields**: Use `fields` parameter to reduce response size
4. **Caching**: Store results for repeated queries

### Example Performance Comparison
```python
# Fast: Direct HTTP (no object conversion)
response = requests.get(f"{api_url}/collections/{collection}/items?limit=500")
items = response.json()['features']  # Raw dictionaries

# Slower: PySTAC conversion (object validation + conversion)
items = [pystac.Item.from_dict(feature) for feature in features]
```

## Error Handling

The CLI implements robust error handling:
```python
try:
    response = self.session.get(url)
    if response.status_code != 200:
        logger.error(f"Failed to get items, status code: {response.status_code}")
        return []
    
    data = response.json()
    
except requests.exceptions.RequestException as e:
    logger.error(f"Network error: {e}")
except json.JSONDecodeError as e:
    logger.error(f"JSON parsing error: {e}")
except Exception as e:
    logger.error(f"Unexpected error: {e}")
```

## Summary

The STAC Explorer CLI uses a **hybrid approach**:
- **HTTP requests** for data retrieval (efficient, direct API access)
- **PySTAC objects** for data manipulation (standardized, validated objects)
- **Pagination support** for large datasets
- **Error handling** for robust operation

This approach provides both performance and the benefits of the PySTAC ecosystem while maintaining direct control over API interactions.