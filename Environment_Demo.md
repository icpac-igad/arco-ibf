# Environment Variable Configuration Demo

## Success! Environment Variables Are Working

The STAC Explorer now successfully loads configuration from the `.env` file using python-dotenv.

### Current Configuration Status

✅ **Environment file loaded**: `.env` file is read automatically  
✅ **URL configured**: STAC_API_URL is loaded from environment variables  
✅ **CLI integration**: Commands now use environment URL by default  
✅ **Streamlit integration**: Web app loads URL from environment  
✅ **Security**: `.env` file is git-ignored to prevent URL exposure  

### Command Examples

Now you can run commands without exposing the URL in source code:

```bash
# Uses URL from .env file automatically
python main.py collections

# Uses URL from .env file with bbox filtering
python main.py items --collection emdat-events --limit 500 --bbox "22,-12,52,23"

# Check API availability using environment URL
python main.py check

# Override environment URL if needed
python main.py collections --url https://different-server.com/stac/
```

### Environment File Structure

Your `.env` file contains:
```bash
STAC_API_URL=your-stac-server-url-here
LOG_LEVEL=INFO
DEFAULT_LIMIT=10
MAX_LIMIT=1000
```

### Benefits Achieved

1. **URL Security**: Sensitive STAC server URLs are no longer hardcoded
2. **Team Flexibility**: Each team member can use their own development servers  
3. **Environment Separation**: Different URLs for development, staging, production
4. **Easy Configuration**: Single `.env` file controls all settings
5. **Git Safety**: `.env` is ignored, preventing accidental URL commits

### Configuration Hierarchy

The system now follows this priority order:
1. Command line `--url` parameter (highest)
2. `STAC_API_URL` environment variable  
3. Default fallback URL (lowest)

### For Team Sharing

Share the `.env.example` file with your team:
```bash
# Team members copy and customize
cp .env.example .env
# Edit .env with their specific settings
```

The source code no longer contains hardcoded URLs, making it safe to share while keeping server configurations private and flexible.