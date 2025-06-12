# Monty STAC Explorer - Disaster Event Analysis Tool

A Python CLI and web application for exploring STAC (Spatio-Temporal Asset Catalog) servers and analyzing disaster-related geospatial data, specifically designed for the Monty disaster data platform and focused on East Africa region events.

## About Monty

Monty is an integrated disaster data platform developed by the International Federation of Red Cross and Red Crescent Societies (IFRC) that aggregates and standardizes disaster event information from multiple global sources. The platform uses STAC extensions to provide unified access to disaster data for humanitarian response and risk reduction.

### Monty Ecosystem

This STAC Explorer is part of the broader Monty ecosystem:

- **[Montandon ETL](https://github.com/IFRCGo/montandon-etl)** - Extract, Transform, Load pipeline for processing disaster data from multiple sources into the Monty platform
- **[PySTAC Monty](https://github.com/IFRCGo/pystac-monty)** - Python library providing STAC extensions and utilities specifically designed for disaster event data
- **[Monty STAC Extension](https://github.com/IFRCGo/monty-stac-extension)** - STAC extension specification defining standardized disaster event metadata schemas

### Data Sources Integration

The Monty platform integrates disaster data from these authoritative global sources:
- **DesInventar** - National disaster inventories and loss databases
- **EM-DAT** - International Disaster Database (CRED)
- **USGS** - United States Geological Survey earthquake monitoring
- **GDACS** - Global Disaster Alert and Coordination System
- **GLIDE** - Global unique disaster identifier system
- **IFRC GO** - IFRC disaster response and preparedness platform
- **IDMC-GIDD** - Internal Displacement Monitoring Centre data
- **GFD** - Global Flood Database

All data is processed through the Montandon ETL pipeline and exposed via STAC-compliant APIs with Monty extensions for disaster-specific metadata.

## Quick Start

### 1. Environment Setup
The sample .env.example in this form 
```bash
# STAC Explorer Environment Configuration
STAC_API_URL=https://sample/stac/
LOG_LEVEL=INFO
DEFAULT_LIMIT=10
MAX_LIMIT=1000
```
The .env.example

```bash
# Copy environment template and configure
cp .env.example .env
# Edit .env with your STAC API URL
```

### 2. Basic Usage
```bash
# Check API connectivity
python main.py check

# List all available collections
python main.py collections

# Get events for East Africa region
python main.py items --collection collection-name --limit 5000 --bbox "30.7,-6,42,15" --format summary
```


## East Africa Bbox Analysis Workflow

The standard workflow for analyzing disaster events in the East Africa region uses the bbox coordinates `"30.7,-6,42,15"` which covers Kenya, Uganda, Tanzania, Ethiopia, Sudan, South Sudan, Somalia, Burundi, Rwanda, and Democratic Republic of Congo.

### Step-by-Step Event Analysis

1. **List Collections**: First, explore available data sources
   ```bash
   python main.py collections
   ```

2. **Analyze Each Collection**: Run bbox queries for East Africa
   ```bash
   python main.py items --collection [collection-name] --limit 5000 --bbox "30.7,-6,42,15" --format summary
   ```

3. **Export Results**: Save detailed data for further analysis
   ```bash
   python main.py items --collection [collection-name] --limit 5000 --bbox "30.7,-6,42,15" --format json --output results.json
   ```

## East Africa Event Analysis Results

Based on bbox analysis for coordinates `30.7,-6,42,15`, here are the disaster event counts by data source:

| Data Source | Collection Name | Events Found | Primary Event Types | Key Countries |
|-------------|----------------|--------------|-------------------|---------------|
| **DesInventar** | `desinventar-events` | 5,000+ | Fire, Flood, Landslide | Kenya (majority) |
| **EM-DAT** | `emdat-events` | 1,190 | Flood, Drought, Air accidents | COD, Sudan, Kenya, Somalia, Ethiopia |
| **USGS** | `usgs-events` | 1,158 | Earthquakes (M 4.0+) | Ethiopia, Tanzania |
| **GDACS** | `gdacs-events` | 861 | Flood, Drought | Kenya, Uganda, Tanzania, Ethiopia |
| **GLIDE** | `glide-events` | 327 | Earthquake, Epidemic, Landslide | Ethiopia, Uganda, Kenya, Sudan |
| **IFRC** | `ifrcevent-events` | 290 | Flood, Drought, Epidemic | COD, Somalia, Tanzania, Uganda, Ethiopia |
| **IDMC-GIDD** | `idmc-gidd-events` | 194 | Displacement from disasters | Uganda, Somalia, Ethiopia, Burundi |
| **GFD** | `gfd-events` | 47 | Heavy Rain, Torrential Rain | Regional coverage |

**Total Events Analyzed**: 9,067+ disaster events in East Africa region

## Detailed Analysis Reports

Each data source has been analyzed with the East Africa bbox filter. Click the links below for detailed command outputs and event listings:

### Major Disaster Databases
- [**DesInventar Events**](desinventar-events.md) - 5,000+ events (primarily Kenya fires and disasters)
- [**EM-DAT Events**](emdat-events.md) - 1,190 events (international disaster database)
- [**USGS Events**](usgs_events.md) - 1,158 events (earthquake monitoring)
- [**GDACS Events**](gdacs-events.md) - 861 events (global disaster alert system)

### Specialized Event Sources
- [**GLIDE Events**](glide-events.md) - 327 events (global unique disaster identifiers)
- [**IFRC Events**](ifrcevents.md) - 290 events (Red Cross disaster response)
- [**IDMC-GIDD Events**](idmc-gidd-event.md) - 194 events (displacement tracking)
- [**GFD Events**](gfd-events.md) - 47 events (flood detection system)

## Geographic Coverage

The East Africa bbox `30.7,-6,42,15` covers these countries:
- **Kenya** - Highest event density (especially DesInventar)
- **Ethiopia** - Major earthquake activity (USGS)
- **Uganda** - Flood and displacement events
- **Tanzania** - Earthquake and flood events
- **Somalia** - Drought and displacement focus
- **Sudan/South Sudan** - Conflict and disaster events
- **Democratic Republic of Congo** - Flood events
- **Burundi** - Displacement events
- **Rwanda** - Limited events in datasets

## Technical Documentation

### Configuration and Setup
- [**Environment Setup Guide**](Environment_Setup_Guide.md) - Comprehensive configuration instructions
- [**Environment Demo**](Environment_Demo.md) - Working example and verification
- [**URL Removal Complete**](URL_Removal_Complete.md) - Security implementation details

### API and Analysis Documentation
- [**STAC API Documentation**](STAC_API_Documentation.md) - API endpoints and usage
- [**East Africa BBox Examples**](East_Africa_BBox_Examples.md) - Geographic coordinate examples
- [**API Method Comparison**](API_Method_Comparison.md) - Technical implementation details


