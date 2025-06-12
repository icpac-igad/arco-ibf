# Installing titiler-pgstac on Replit

This guide provides step-by-step instructions for installing [titiler-pgstac](https://github.com/stac-utils/titiler-pgstac) on Replit. The titiler-pgstac package connects TiTiler (a dynamic tile server) with pgSTAC (PostgreSQL implementation of SpatioTemporal Asset Catalogs).

## Prerequisites

Before starting the installation, make sure you have:

- A Replit account
- PostgreSQL database enabled in your Replit project (automatically provided in Replit secrets)

## Installation Challenges on Replit

Installing titiler-pgstac on Replit presents some challenges due to system limitations:

1. **System Dependencies**: GDAL and other geospatial libraries require system-level packages that are difficult to install in the Replit environment.
2. **Python Dependencies**: Some Python packages like rasterio depend on system libraries that may not be available on Replit.
3. **PostgreSQL Extensions**: The PostGIS extension is required but may need special setup.

## 📖 Documentation

### Core Documentation
- **[📋 Project Overview](docs/01-project-overview.md)** - Architecture, background, and technical achievements
- **[🛠️ GDAL Installation Guide](docs/02-gdal-installation.md)** - Complete GDAL setup for Replit environment
- **[🗄️ Database Setup](docs/03-database-setup.md)** - Neon PostgreSQL configuration with pgSTAC
- **[🔄 Reverse Proxy Setup](docs/04-reverse-proxy-setup.md)** - Nginx configuration for HTTPS URL generation

### Development Documentation  
- **[🔄 Development Iterations](docs/05-development-iterations.md)** - Complete development journey and problem-solving
- **[🧪 Testing Procedures](docs/06-testing-procedures.md)** - Comprehensive testing framework and validation

### Additional Resources
- **[📦 Deployment Files Guide](DEPLOYMENT_FILES.md)** - Essential files for minimal deployment
- **[⚙️ Installation Guides](GDAL_INSTALLATION_GUIDE.md)** - Detailed GDAL installation procedures
- **[🔗 Database Setup Guide](neodb-pgstac-setup.md)** - External database configuration

## 🏗️ Architecture Overview

### System Components
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Replit App    │    │   Nginx Proxy    │    │  Neon Database  │
│                 │    │                  │    │                 │
│  TiTiler API    │◄──►│  HTTPS/HTTP      │    │  PostgreSQL +   │
│  GDAL/Rasterio │    │  Load Balancing  │    │  PostGIS +      │
│  Service Mgmt   │    │  Caching         │    │  pgSTAC         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Data Flow
1. **Client Request** → Nginx Proxy (HTTPS termination)
2. **Proxy Forward** → TiTiler Backend (HTTP internal)
3. **Data Query** → External PostgreSQL (pgSTAC/PostGIS)
4. **Tile Generation** → GDAL/Rasterio processing
5. **Response** → Client (HTTPS with proper URLs)
