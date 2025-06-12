# Reverse Proxy Setup with Nginx

## Overview

The reverse proxy setup solves a critical issue in Replit's hosting environment: TiTiler generates HTTP URLs instead of HTTPS URLs, causing mixed content warnings and API endpoint failures. Nginx acts as a reverse proxy to handle HTTPS termination and proper URL generation.

## Problem Statement

### URL Generation Issues
When TiTiler runs directly on Replit, it generates URLs like:
```
http://titiler-pgstac.username.replit.dev/tiles/{z}/{x}/{y}
```

But Replit serves content over HTTPS, causing:
- Mixed content warnings in browsers
- Tile loading failures
- API endpoint accessibility issues
- Security policy violations

### Solution Architecture
Nginx reverse proxy configuration that:
- Accepts HTTPS requests from clients
- Proxies to TiTiler backend over HTTP (internal)
- Handles proper header forwarding for URL generation
- Manages SSL termination and certificate handling

## Nginx Configuration

### Core Configuration (`nginx.conf`)

```nginx
# Nginx configuration for TiTiler reverse proxy on Replit
worker_processes 1;
daemon off;
error_log /dev/stderr info;
pid /tmp/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    # Basic settings
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    
    # Logging
    access_log /dev/stdout combined;
    error_log /dev/stderr warn;
    
    # Performance optimizations
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 10M;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;
    
    # Proxy settings for proper URL generation
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Port $server_port;
    
    # Upstream backend (TiTiler application)
    upstream titiler_backend {
        server 127.0.0.1:8001;
        keepalive 32;
    }
    
    server {
        listen 8000;
        server_name _;
        
        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
        
        # Nginx status (for monitoring)
        location /nginx_status {
            stub_status on;
            access_log off;
            allow 127.0.0.1;
            deny all;
        }
        
        # Proxy all requests to TiTiler backend
        location / {
            proxy_pass http://titiler_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;  # Force HTTPS in backend
            proxy_set_header X-Forwarded-Host $host;
            proxy_set_header X-Forwarded-Port 443;     # Standard HTTPS port
            
            # Timeouts
            proxy_connect_timeout 5s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
            
            # Buffering
            proxy_buffering on;
            proxy_buffer_size 4k;
            proxy_buffers 8 4k;
            proxy_busy_buffers_size 8k;
            
            # Error handling
            proxy_next_upstream error timeout invalid_header http_500 http_502 http_503 http_504;
            proxy_next_upstream_tries 2;
            proxy_next_upstream_timeout 10s;
        }
        
        # Special handling for tile requests (optimization)
        location ~* ^/tiles/ {
            proxy_pass http://titiler_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-Proto https;
            proxy_set_header X-Forwarded-Host $host;
            
            # Caching headers for tiles
            expires 1h;
            add_header Cache-Control "public, immutable";
            add_header X-Served-By "nginx-proxy";
            
            # Optimized timeouts for tile requests
            proxy_connect_timeout 3s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
        }
        
        # Static file serving (if needed)
        location /static/ {
            alias /app/static/;
            expires 1d;
            add_header Cache-Control "public, immutable";
        }
        
        # Error pages
        error_page 502 503 504 /50x.html;
        location = /50x.html {
            return 503 '{"error": "Service temporarily unavailable"}';
            add_header Content-Type application/json;
        }
    }
}
```

## Service Orchestration

### Service Manager (`start_services.py`)

```python
#!/usr/bin/env python3
"""
Service launcher for Nginx + TiTiler on Replit.
Handles both development and production modes.
"""
import os
import signal
import subprocess
import sys
import time
import socket
from pathlib import Path
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global process tracking
processes = []

def cleanup(signum=None, frame=None):
    """Clean up all processes on exit."""
    logger.info("Shutting down services...")
    
    for process in processes:
        if process and process.poll() is None:
            logger.info(f"Terminating process {process.pid}")
            try:
                process.terminate()
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                logger.warning(f"Force killing process {process.pid}")
                process.kill()
            except Exception as e:
                logger.error(f"Error terminating process: {e}")
    
    logger.info("All services stopped")
    sys.exit(0)

def setup_nginx_directories():
    """Create necessary directories for Nginx."""
    dirs = [
        "/tmp/nginx",
        "/tmp/nginx/logs",
        "/tmp/nginx/cache",
        "/tmp/nginx/client_body",
        "/tmp/nginx/proxy",
        "/tmp/nginx/fastcgi",
        "/tmp/nginx/uwsgi",
        "/tmp/nginx/scgi"
    ]
    
    for dir_path in dirs:
        Path(dir_path).mkdir(parents=True, exist_ok=True)
        logger.info(f"Created directory: {dir_path}")

def check_nginx_config():
    """Validate Nginx configuration."""
    try:
        result = subprocess.run([
            "nginx", "-t", "-c", os.path.abspath("nginx.conf")
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            logger.info("✓ Nginx configuration is valid")
            return True
        else:
            logger.error(f"✗ Nginx configuration error: {result.stderr}")
            return False
    except Exception as e:
        logger.error(f"✗ Failed to check Nginx config: {e}")
        return False

def start_titiler(mode='production'):
    """Start TiTiler backend."""
    logger.info(f"Starting TiTiler in {mode} mode...")
    
    if mode == 'development':
        cmd = [
            sys.executable, "-m", "uvicorn", "main:app",
            "--host", "127.0.0.1",
            "--port", "8001", 
            "--reload",
            "--log-level", "debug"
        ]
    else:
        cmd = [
            sys.executable, "-m", "uvicorn", "main:app",
            "--host", "127.0.0.1",
            "--port", "8001",
            "--workers", "2",
            "--log-level", "info"
        ]
    
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )
        
        processes.append(process)
        logger.info(f"✓ TiTiler started with PID {process.pid}")
        
        # Start log monitoring thread
        def log_output():
            for line in iter(process.stdout.readline, ''):
                if line.strip():
                    logger.info(f"TiTiler: {line.strip()}")
        
        import threading
        log_thread = threading.Thread(target=log_output, daemon=True)
        log_thread.start()
        
        return process
        
    except Exception as e:
        logger.error(f"✗ Failed to start TiTiler: {e}")
        return None

def start_nginx(nginx_conf_path):
    """Start Nginx."""
    logger.info("Starting Nginx...")
    
    cmd = [
        "nginx",
        "-c", os.path.abspath(nginx_conf_path),
        "-g", "daemon off;"
    ]
    
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )
        
        processes.append(process)
        logger.info(f"✓ Nginx started with PID {process.pid}")
        
        # Start log monitoring thread
        def log_output():
            for line in iter(process.stdout.readline, ''):
                if line.strip():
                    logger.info(f"Nginx: {line.strip()}")
        
        import threading
        log_thread = threading.Thread(target=log_output, daemon=True)
        log_thread.start()
        
        return process
        
    except Exception as e:
        logger.error(f"✗ Failed to start Nginx: {e}")
        return None

def wait_for_service(host, port, timeout=30):
    """Wait for a service to become available."""
    logger.info(f"Waiting for service on {host}:{port}...")
    
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex((host, port))
            sock.close()
            
            if result == 0:
                logger.info(f"✓ Service available on {host}:{port}")
                return True
        except Exception:
            pass
        
        time.sleep(1)
    
    logger.error(f"✗ Service not available on {host}:{port} after {timeout}s")
    return False

def main():
    """Main entry point."""
    # Handle command line arguments
    mode = 'production'
    if len(sys.argv) > 1:
        mode = sys.argv[1].lower()
        if mode not in ['development', 'production']:
            logger.error("Usage: python start_services.py [development|production]")
            sys.exit(1)
    
    logger.info(f"Starting services in {mode} mode...")
    
    # Set up signal handlers
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)
    
    try:
        # Setup Nginx directories
        setup_nginx_directories()
        
        # Validate Nginx configuration
        if not check_nginx_config():
            logger.error("Nginx configuration validation failed")
            sys.exit(1)
        
        # Start TiTiler backend
        titiler_process = start_titiler(mode)
        if not titiler_process:
            logger.error("Failed to start TiTiler")
            sys.exit(1)
        
        # Wait for TiTiler to be ready
        if not wait_for_service("127.0.0.1", 8001):
            logger.error("TiTiler failed to start properly")
            cleanup()
            sys.exit(1)
        
        # Start Nginx
        nginx_process = start_nginx("nginx.conf")
        if not nginx_process:
            logger.error("Failed to start Nginx")
            cleanup()
            sys.exit(1)
        
        # Wait for Nginx to be ready
        if not wait_for_service("127.0.0.1", 8000):
            logger.error("Nginx failed to start properly")
            cleanup()
            sys.exit(1)
        
        logger.info("🚀 All services started successfully!")
        logger.info("📍 Application available at: https://your-repl.replit.dev")
        logger.info("🔍 Health check: https://your-repl.replit.dev/health")
        
        # Keep main process alive
        while True:
            # Check if processes are still running
            for process in processes:
                if process.poll() is not None:
                    logger.error(f"Process {process.pid} died unexpectedly")
                    cleanup()
                    sys.exit(1)
            
            time.sleep(5)
            
    except KeyboardInterrupt:
        logger.info("Received interrupt signal")
        cleanup()
        
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        cleanup()
        sys.exit(1)

if __name__ == "__main__":
    main()
```

## Integration with TiTiler

### Application Configuration

#### FastAPI Configuration for Proxy
```python
from fastapi import FastAPI, Request
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="TiTiler-PgSTAC with Nginx Proxy",
    description="Geospatial tile server with proper HTTPS support",
    root_path="",  # Let proxy handle root path
    docs_url="/docs",
    redoc_url="/redoc"
)

# Trust proxy headers
app.add_middleware(
    TrustedHostMiddleware, 
    allowed_hosts=["*.replit.dev", "*.replit.app", "localhost"]
)

# CORS configuration for cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log incoming requests for debugging."""
    # Log proxy headers
    headers = {
        "host": request.headers.get("host"),
        "x-forwarded-proto": request.headers.get("x-forwarded-proto"),
        "x-forwarded-host": request.headers.get("x-forwarded-host"),
        "x-forwarded-port": request.headers.get("x-forwarded-port"),
    }
    
    logger.info(f"Request: {request.method} {request.url}")
    logger.debug(f"Proxy headers: {headers}")
    
    response = await call_next(request)
    return response
```

#### URL Generation Fix
```python
from fastapi import Request
from urllib.parse import urljoin

def get_base_url(request: Request) -> str:
    """Get the proper base URL considering proxy headers."""
    # Check for proxy headers first
    forwarded_proto = request.headers.get("x-forwarded-proto", "http")
    forwarded_host = request.headers.get("x-forwarded-host", request.headers.get("host"))
    
    if forwarded_host:
        return f"{forwarded_proto}://{forwarded_host}"
    
    # Fallback to request URL
    return str(request.base_url).rstrip('/')

@app.get("/")
async def root(request: Request):
    """Root endpoint with proper URL generation."""
    base_url = get_base_url(request)
    
    return {
        "title": "TiTiler-PgSTAC",
        "description": "Geospatial tile server",
        "base_url": base_url,
        "endpoints": {
            "docs": f"{base_url}/docs",
            "health": f"{base_url}/health",
            "collections": f"{base_url}/collections",
            "tiles": f"{base_url}/collections/{{collection_id}}/items/{{item_id}}/tiles/{{tileMatrixSetId}}/{{z}}/{{x}}/{{y}}"
        }
    }
```

## Testing and Verification

### Service Health Checks

#### Comprehensive Health Check
```python
@app.get("/health")
async def health_check():
    """Comprehensive health check endpoint."""
    health_status = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "application": "healthy",
            "database": "unknown",
            "proxy": "unknown"
        },
        "proxy_headers": {}
    }
    
    # Check database connectivity
    try:
        async with db_manager.get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT 1")
        health_status["services"]["database"] = "healthy"
    except Exception as e:
        health_status["services"]["database"] = f"unhealthy: {str(e)}"
        health_status["status"] = "degraded"
    
    return health_status

@app.get("/health/proxy")  
async def proxy_health_check(request: Request):
    """Check proxy configuration and headers."""
    return {
        "proxy_headers": {
            "host": request.headers.get("host"),
            "x-forwarded-proto": request.headers.get("x-forwarded-proto"),
            "x-forwarded-host": request.headers.get("x-forwarded-host"),
            "x-forwarded-port": request.headers.get("x-forwarded-port"),
            "x-real-ip": request.headers.get("x-real-ip"),
            "x-forwarded-for": request.headers.get("x-forwarded-for")
        },
        "request_url": str(request.url),
        "base_url": get_base_url(request)
    }
```

### Testing Script

#### End-to-End Testing
```python
#!/usr/bin/env python3
"""Test script to verify Nginx + TiTiler setup."""
import requests
import time
import json

def test_endpoint(url, name):
    """Test a single endpoint."""
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            print(f"✓ {name}: {response.status_code}")
            return True
        else:
            print(f"✗ {name}: {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ {name}: Error - {e}")
        return False

def main():
    """Run tests."""
    base_url = "https://your-repl.replit.dev"
    
    tests = [
        (f"{base_url}/health", "Health Check"),
        (f"{base_url}/health/proxy", "Proxy Health"),
        (f"{base_url}/docs", "API Documentation"),
        (f"{base_url}/collections", "Collections Endpoint"),
        (f"{base_url}/", "Root Endpoint")
    ]
    
    print("Testing Nginx + TiTiler setup...")
    print("=" * 50)
    
    passed = 0
    total = len(tests)
    
    for url, name in tests:
        if test_endpoint(url, name):
            passed += 1
        time.sleep(1)
    
    print("=" * 50)
    print(f"Tests passed: {passed}/{total}")
    
    if passed == total:
        print("🎉 All tests passed! Nginx proxy is working correctly.")
    else:
        print("⚠️  Some tests failed. Check the logs for details.")

if __name__ == "__main__":
    main()
```

## Performance Optimization

### Nginx Optimizations

#### Caching Configuration
```nginx
# Tile caching configuration
location ~* ^/tiles/.+\.(png|jpg|jpeg|webp)$ {
    proxy_pass http://titiler_backend;
    proxy_cache tiles_cache;
    proxy_cache_valid 200 302 1h;
    proxy_cache_valid 404 1m;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    add_header X-Cache-Status $upstream_cache_status;
}

# Cache zone definition (add to http block)
proxy_cache_path /tmp/nginx/cache levels=1:2 keys_zone=tiles_cache:10m max_size=100m inactive=60m;
```

#### Connection Optimization
```nginx
# Upstream with connection pooling
upstream titiler_backend {
    server 127.0.0.1:8001 max_conns=100;
    keepalive 16;
    keepalive_requests 100;
    keepalive_timeout 60s;
}
```

### Monitoring

#### Performance Metrics
```python
@app.get("/metrics")
async def get_metrics():
    """Application performance metrics."""
    return {
        "uptime": time.time() - start_time,
        "requests_total": request_counter.get(),
        "active_connections": len(active_connections),
        "cache_hit_rate": cache_hits / (cache_hits + cache_misses) if (cache_hits + cache_misses) > 0 else 0
    }
```

This reverse proxy setup ensures proper HTTPS URL generation, improved performance through caching, and robust service management for TiTiler-PgSTAC deployment on Replit.