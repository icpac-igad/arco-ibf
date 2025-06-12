# East Africa Bounding Box Examples

## Overview
The STAC Explorer CLI now supports bbox (bounding box) filtering to retrieve items within specific geographic areas. This is particularly useful for filtering data to the East Africa region covering the 11 ICPAC countries.

## East Africa Bounding Box Coordinates

### Regional Coverage
The East Africa region covering all 11 ICPAC countries:
- **West**: 22°E (western border of Sudan)
- **South**: -12°S (southern border of Tanzania) 
- **East**: 52°E (eastern border of Somalia)
- **North**: 23°N (northern border of Sudan/Eritrea)

**Bbox format**: `west,south,east,north` = `22,-12,52,23`

### Individual Country Bounding Boxes

| Country | Code | Bbox (west,south,east,north) |
|---------|------|------------------------------|
| Burundi | BDI | 28.9,-4.5,30.9,-2.3 |
| Djibouti | DJI | 41.8,10.9,43.4,12.7 |
| Eritrea | ERI | 36.4,12.4,43.1,18.0 |
| Ethiopia | ETH | 32.9,3.4,48.0,14.9 |
| Kenya | KEN | 33.9,-4.7,41.9,5.5 |
| Rwanda | RWA | 28.9,-2.8,30.9,-1.0 |
| Somalia | SOM | 40.9,-1.7,51.4,12.0 |
| South Sudan | SSD | 24.1,3.5,35.9,12.2 |
| Sudan | SDN | 21.8,8.7,38.6,22.0 |
| Tanzania | TZA | 29.3,-11.7,40.4,-0.95 |
| Uganda | UGA | 29.6,-1.5,35.0,4.2 |

## CLI Usage Examples

### 1. Basic East Africa Search
```bash
# Search all 11 ICPAC countries
python main.py items --collection emdat-events --limit 500 --bbox "22,-12,52,23"
```

### 2. Horn of Africa Focus
```bash
# Focus on Horn of Africa (Ethiopia, Somalia, Eritrea, Djibouti)
python main.py items --collection gdacs-events --limit 200 --bbox "36,3,52,18"
```

### 3. East African Community (EAC) Countries
```bash
# Kenya, Tanzania, Uganda, Rwanda, Burundi, South Sudan
python main.py items --collection desinventar-events --limit 300 --bbox "28.9,-12,41.9,12.2"
```

### 4. Individual Country Examples
```bash
# Kenya only
python main.py items --collection emdat-events --limit 100 --bbox "33.9,-4.7,41.9,5.5"

# Ethiopia only  
python main.py items --collection gdacs-events --limit 100 --bbox "32.9,3.4,48.0,14.9"

# Sudan only
python main.py items --collection pdc-events --limit 100 --bbox "21.8,8.7,38.6,22.0"
```

### 5. Different Output Formats
```bash
# JSON output for East Africa
python main.py items --collection emdat-events --limit 500 --bbox "22,-12,52,23" --format json

# Summary format
python main.py items --collection gdacs-events --limit 200 --bbox "22,-12,52,23" --format summary
```

## Understanding the Bbox Filter

### How It Works
1. **Geographic Filtering**: Server filters items based on their geometry/bbox intersection
2. **Coordinate System**: Uses WGS84 (EPSG:4326) longitude/latitude
3. **Intersection Logic**: Returns items that intersect with the specified bounding box
4. **Performance**: Server-side filtering reduces data transfer

### Request Example
When you run:
```bash
python main.py items --collection emdat-events --limit 500 --bbox "22,-12,52,23"
```

The CLI generates this HTTP request:
```http
GET /collections/emdat-events/items?limit=500&bbox=22,-12,52,23 HTTP/1.1
Host: montandon-eoapi-stage.ifrc.org
```

### Expected Results
Items returned will be:
- Events/hazards that occurred within the East Africa region
- Geometries that intersect with the specified bounding box
- Filtered at the server level for efficiency

## Practical Use Cases

### 1. Regional Disaster Monitoring
```bash
# Monitor recent disasters across East Africa
python main.py items --collection gdacs-events --limit 1000 --bbox "22,-12,52,23"
```

### 2. Country-Specific Analysis
```bash
# Analyze flood events in Kenya
python main.py items --collection gfd-events --limit 200 --bbox "33.9,-4.7,41.9,5.5"
```

### 3. Cross-Border Events
```bash
# Events affecting Ethiopia-Sudan border region
python main.py items --collection emdat-events --limit 100 --bbox "32,8,38,15"
```

### 4. Coastal vs Inland Analysis
```bash
# Coastal East Africa (Indian Ocean coast)
python main.py items --collection pdc-events --limit 200 --bbox "39,-12,52,12"

# Inland East Africa (Great Lakes region)
python main.py items --collection desinventar-events --limit 200 --bbox "28,-5,36,5"
```

## Bbox Validation

The CLI validates bbox parameters:
- **Format**: Must be exactly 4 comma-separated numbers
- **Order**: west,south,east,north
- **Ranges**: Longitude [-180,180], Latitude [-90,90]
- **Logic**: west < east, south < north

### Error Examples
```bash
# Wrong format (too few values)
python main.py items --collection emdat-events --bbox "22,-12,52"
# Error: Bbox must have exactly 4 values

# Wrong order (west > east)
python main.py items --collection emdat-events --bbox "52,-12,22,23"  
# May return no results or server error
```

## Performance Considerations

### Optimal Bbox Sizes
- **Small areas**: Faster queries, more precise results
- **Large areas**: Slower queries, more comprehensive coverage
- **East Africa bbox**: Good balance for regional analysis

### Query Optimization
```bash
# Start with smaller bbox for testing
python main.py items --collection emdat-events --limit 10 --bbox "33,-5,42,5"

# Expand for comprehensive analysis
python main.py items --collection emdat-events --limit 500 --bbox "22,-12,52,23"
```

## Integration with Other Filters

While bbox is currently the main spatial filter, it can be combined with:
- **Collection filtering**: Specific data sources
- **Limit parameter**: Control result size
- **Output format**: Choose presentation style

Future enhancements could include:
- Date range filtering
- Country code filtering
- Hazard type filtering

## Troubleshooting

### No Results Returned
1. **Check bbox coordinates**: Ensure they cover your area of interest
2. **Verify collection**: Some collections may have limited geographic coverage
3. **Increase limit**: Default limit might be too small
4. **Check coordinate order**: Must be west,south,east,north

### Large Query Times
1. **Reduce bbox size**: Focus on specific regions
2. **Lower limit parameter**: Start with smaller result sets
3. **Use summary format**: Faster processing for overview

This bbox functionality enables precise geographic filtering for East Africa disaster and hazard data analysis across all available STAC collections.