# Environment Configuration Guide

## Overview
The STAC Explorer now supports environment variables for secure configuration management using python-dotenv. This prevents sensitive URLs and credentials from being hardcoded in the source code.

## Setup Instructions

### 1. Install Dependencies
The python-dotenv library is already installed as part of the project dependencies.

### 2. Create Environment File
Copy the example environment file and customize it:

```bash
cp .env.example .env
```

### 3. Configure Environment Variables

Edit the `.env` file with your specific settings:

```bash
# STAC API Configuration
STAC_API_URL=https://your-custom-stac-server.com/stac/

# Optional: API credentials (if required)
# STAC_API_KEY=your_api_key_here
# STAC_USERNAME=your_username
# STAC_PASSWORD=your_password

# Logging Configuration
LOG_LEVEL=INFO

# Application Settings
DEFAULT_LIMIT=10
MAX_LIMIT=1000
```

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `STAC_API_URL` | **Required** | Base URL of the STAC API |
| `STAC_API_KEY` | None | API key for authenticated access |
| `STAC_USERNAME` | None | Username for basic authentication |
| `STAC_PASSWORD` | None | Password for basic authentication |
| `LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR) |
| `DEFAULT_LIMIT` | `10` | Default number of items to retrieve |
| `MAX_LIMIT` | `1000` | Maximum allowed limit for queries |

## Usage Examples

### CLI Usage
The CLI automatically loads environment variables:

```bash
# Uses STAC_API_URL from .env file
python main.py collections

# Override with command line parameter
python main.py collections --url https://another-stac-server.com/stac/

# With bbox filtering (uses env URL)
python main.py items --collection emdat-events --limit 500 --bbox "22,-12,52,23"
```

### Streamlit App Usage
The Streamlit app loads the URL from environment variables:

```bash
# Start the app (uses STAC_API_URL from .env)
streamlit run app.py --server.port 5000
```

The app will show the environment URL as the default value in the URL input field.

## Security Benefits

### 1. URL Protection
- Sensitive STAC server URLs are not exposed in source code
- Different environments can use different URLs
- Team members can use their own development servers

### 2. Credential Management
- API keys and passwords stored securely in `.env`
- `.env` file is git-ignored to prevent accidental commits
- Easy rotation of credentials

### 3. Environment Separation
```bash
# Development
STAC_API_URL=https://dev-stac-server.com/stac/

# Staging  
STAC_API_URL=https://staging-stac-server.com/stac/

# Production
STAC_API_URL=https://prod-stac-server.com/stac/
```

## Configuration Hierarchy

The application follows this configuration priority:

1. **Command line arguments** (highest priority)
2. **Environment variables** from `.env` file
3. **Default values** in code (lowest priority)

### Example Priority
```bash
# 1. Command line overrides everything
python main.py collections --url https://custom-server.com/stac/

# 2. Environment variable used if no command line arg
export STAC_API_URL=https://env-server.com/stac/
python main.py collections

# 3. Default value used if neither above are set
# Uses: https://montandon-eoapi-stage.ifrc.org/stac/
```

## File Structure

```
project/
├── .env                    # Your environment config (git-ignored)
├── .env.example           # Template file (committed to git)
├── .gitignore            # Includes .env
├── main.py               # CLI with env support
├── app.py                # Streamlit app with env support
└── Environment_Setup_Guide.md
```

## Common Use Cases

### 1. Development Team Setup
Each developer creates their own `.env`:

```bash
# Developer A
STAC_API_URL=https://dev-a.stac-server.com/stac/

# Developer B  
STAC_API_URL=https://dev-b.stac-server.com/stac/
```

### 2. Production Deployment
```bash
# Production .env
STAC_API_URL=https://secure-prod-stac.company.com/stac/
STAC_API_KEY=prod_api_key_12345
LOG_LEVEL=WARNING
```

### 3. Multiple Environments
```bash
# Create environment-specific files
.env.development
.env.staging  
.env.production

# Load specific environment
python -c "from dotenv import load_dotenv; load_dotenv('.env.staging')"
```

## Troubleshooting

### Environment Not Loading
```bash
# Check if .env file exists
ls -la .env

# Verify contents
cat .env

# Test environment loading
python -c "from dotenv import load_dotenv; import os; load_dotenv(); print(os.getenv('STAC_API_URL'))"
```

### Wrong URL Being Used
Check the configuration hierarchy:
1. Verify `.env` file contents
2. Check for command line `--url` parameter
3. Ensure `load_dotenv()` is called before accessing variables

### Streamlit Not Using Environment
Restart the Streamlit server after changing `.env`:
```bash
# Stop current server (Ctrl+C)
# Restart
streamlit run app.py --server.port 5000
```

This environment variable setup provides secure, flexible configuration management for both development and production use.