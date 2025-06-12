"""
Proper TiPG Vector Tile Server using native tipg architecture
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from tipg.main import app as tipg_app


def create_app() -> FastAPI:
    """Create a properly configured TiPG application"""
    
    # Set required environment variables for tipg
    os.environ.setdefault("TIPG_DEBUG", "TRUE")
    os.environ.setdefault("TIPG_DEFAULT_MINZOOM", "0")
    os.environ.setdefault("TIPG_DEFAULT_MAXZOOM", "22")
    os.environ.setdefault("TIPG_ONLY_SPATIAL_TABLES", "FALSE")
    
    # Configure database settings
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        os.environ["DATABASE_URL"] = database_url
    
    print(f"Starting TiPG Vector Tile Server")
    print(f"Database URL configured: {bool(database_url)}")
    
    # Return the properly configured tipg app
    return tipg_app


# Create the application instance
app = create_app()

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "5000"))
    host = os.getenv("HOST", "0.0.0.0")
    
    print(f"Starting server on {host}:{port}")
    uvicorn.run("tipg_main:app", host=host, port=port, reload=False)