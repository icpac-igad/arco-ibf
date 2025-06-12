# TiPG Vector Tile Server

A production-ready vector tile server built with [TiPG (OGC Features and Tiles API)](https://github.com/developmentseed/tipg), designed for seamless deployment on Replit with AI agent assistance.

## 🚀 Features

- **OGC Compliant**: Full implementation of OGC Features API and Tiles API standards
- **Vector Tiles**: Mapbox Vector Tile (MVT) generation for high-performance web mapping
- **Multiple Formats**: GeoJSON, CSV, and GeoJSONSeq output support
- **Spatial Database**: PostgreSQL with PostGIS for robust spatial operations
- **Replit Optimized**: Designed for Replit platform with automated setup
- **AI Agent Ready**: Built with AI agent assistance for easy development and deployment

## 🤖 Replit AI Agent Deployment (Recommended)

This project was developed using Replit's AI agent system, providing the fastest deployment path:

### 1. Fork or Import to Replit
- Fork this repository in Replit
- Or create a new Repl and import from GitHub

### 2. AI Agent Setup
- Open Replit AI chat
- Ask: "Deploy this TiPG vector tile server with PostgreSQL database"
- The AI agent will automatically:
  - Install required dependencies
  - Set up PostgreSQL database with PostGIS
  - Configure environment variables
  - Load test data
  - Start the server

### 3. Access Your Server
- Server runs on port 5000 (Replit's standard web port)
- API endpoints available immediately
- Built-in test data with 16,269+ spatial features

## 📋 Manual Replit Setup

If you prefer manual setup on Replit:

### Prerequisites
- Replit account
- PostgreSQL database (automatically available in Replit)

### Installation Steps
1. **Database Setup**: PostgreSQL with PostGIS is pre-configured in Replit
2. **Dependencies**: Automatically installed via `.replit` configuration
3. **Environment**: Database credentials are auto-configured via environment variables
4. **Start Server**: Click "Run" button or execute `python tipg_main.py`

### Quick Commands
```bash
# Start the server (or use Run button)
python tipg_main.py

# Run tests
python -m pytest tests/test_tipg_phase*.py -v

# Load test data (if needed)
python -c "from tests.conftest_tipg import setup_tipg_test_data; setup_tipg_test_data()"
```

### Replit Configuration
The project includes a `.replit` file that automatically configures:
- **Python 3.11** runtime environment
- **PostgreSQL 16** with PostGIS extension  
- **Nix packages** for spatial data processing
- **Workflow automation** for one-click deployment
- **Port configuration** (5000 → 80 mapping)

This ensures consistent deployment across all Replit environments.

## 📊 Performance Metrics

- **Query Speed**: 100 features in 0.124 seconds
- **Tile Generation**: 745KB tiles for complex global datasets
- **Standards Compliance**: 18 OGC conformance classes
- **Collections**: 11+ spatial datasets included
- **Concurrent Users**: Optimized for production workloads

## 🗺️ Available Collections

| Collection | Features | Description |
|------------|----------|-------------|
| `public.landsat_wrs` | 16,269 | Landsat Worldwide Reference System grid |
| `public.my_data` | 6 | Multi-geometry test dataset |
| `public.sample_points` | N/A | NYC landmark locations |
| `public.sample_polygons` | N/A | NYC administrative areas |

## 📚 Documentation

Comprehensive documentation is available in the [`docs/`](./docs/) directory:

- **[📖 Implementation Overview](./docs/implementation-overview.md)** - Technical architecture and design decisions
- **[🛠️ Development Journey](./docs/development-journey.md)** - Complete development process with AI agent iterations
- **[🧪 Testing Framework](./docs/testing-framework.md)** - Comprehensive testing approach and validation
- **[📋 API Reference](./docs/api-reference.md)** - Complete API documentation and usage examples
- **[🚀 Replit Deployment Guide](./docs/deployment-guide.md)** - Replit-specific deployment with AI agent assistance
- **[⚙️ Replit Configuration](./docs/replit-configuration.md)** - Complete .replit file reference and customization guide

## 🧪 Testing

The project includes a comprehensive test suite based on the official TiPG testing framework:

```bash
# Run all test phases
python -m pytest tests/test_tipg_phase*.py -v

# Run specific test phase
python -m pytest tests/test_tipg_phase1_basic.py -v
```

**Test Coverage**:
- ✅ Phase 1: Basic functionality (OGC compliance)
- ✅ Phase 2: Collection metadata (spatial extents)
- ✅ Phase 3: Feature queries (multiple formats)
- ✅ Phase 4: Vector tile generation (MVT)
- ✅ Phase 5: TileJSON specification

## 🌐 Client Integration

### JavaScript (MapLibre GL JS)
```javascript
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      'tipg-tiles': {
        type: 'vector',
        tiles: ['http://localhost:5000/collections/public.my_data/tiles/WebMercatorQuad/{z}/{x}/{y}']
      }
    },
    layers: [{
      id: 'data-layer',
      type: 'fill',
      source: 'tipg-tiles',
      'source-layer': 'public.my_data'
    }]
  }
});
```

### Python
```python
import requests

# Get features
response = requests.get('http://localhost:5000/collections/public.my_data/items')
features = response.json()

# Get vector tile
tile_response = requests.get('http://localhost:5000/collections/public.my_data/tiles/WebMercatorQuad/10/512/512')
mvt_data = tile_response.content
```

## 🏗️ Technology Stack

- **Backend**: FastAPI with TiPG
- **Database**: PostgreSQL + PostGIS (Replit managed)
- **Vector Tiles**: Mapbox Vector Tile (MVT)
- **Standards**: OGC Features API 1.0, OGC Tiles API 1.0
- **Testing**: pytest with comprehensive coverage
- **Platform**: Replit with AI agent development
- **Deployment**: Replit Deployments (one-click deployment)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run the test suite
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🚀 Why Replit + AI Agent?

This implementation showcases the power of AI-assisted development on Replit:

- **Rapid Prototyping**: From concept to working server in minutes
- **Automated Setup**: Database, dependencies, and configuration handled automatically
- **Instant Deployment**: No DevOps knowledge required
- **Iterative Development**: AI agent helps debug and optimize in real-time
- **Production Ready**: Scales from prototype to production seamlessly

## 🙏 Acknowledgments

- **[Replit](https://replit.com/)** - Platform and AI agent development environment
- **[TiPG Project](https://github.com/developmentseed/tipg)** - Core OGC API implementation
- **[Development Seed](https://developmentseed.org/)** - Original TiPG development
- **[OGC](https://www.ogc.org/)** - Open standards for geospatial data

---

**Built with 🤖 Replit AI Agent for the geospatial community**