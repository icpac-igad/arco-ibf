# Replit Deployment Guide

## Replit AI Agent Deployment (Recommended)

This project was built using Replit's AI agent system, providing the most efficient deployment path for spatial data APIs.

### Prerequisites
- Replit account (free tier sufficient for development)
- Basic understanding of spatial data concepts
- No local development environment needed

### AI Agent Deployment Process

#### 1. Initial Setup
```
1. Fork this repository in Replit
2. Open the AI chat in your Repl
3. Ask: "Set up this TiPG vector tile server with test data"
```

The AI agent will automatically:
- Install all Python dependencies
- Configure PostgreSQL database with PostGIS extension
- Set up environment variables
- Load official TiPG test data (16,269+ spatial features)
- Start the server on port 5000

#### 2. Verification Steps
The AI agent will verify:
- Database connectivity and PostGIS functions
- OGC API compliance (18 conformance standards)
- Vector tile generation
- Multiple output formats (GeoJSON, CSV, GeoJSONSeq)
- Performance benchmarks

#### 3. Instant Access
- **API Landing Page**: `https://your-repl-name.username.repl.co`
- **Collections Endpoint**: `https://your-repl-name.username.repl.co/collections`
- **Vector Tiles**: `https://your-repl-name.username.repl.co/collections/public.landsat_wrs/tiles/WebMercatorQuad/0/0/0`

## Replit Configuration File

The project includes a comprehensive `.replit` configuration file that automates the entire setup:

```toml
modules = ["python-3.11", "postgresql-16"]

[nix]
channel = "stable-24_05"
packages = ["libiconv", "libxcrypt", "postgresql"]

[workflows]
runButton = "Project"

[[workflows.workflow]]
name = "TiPG Native Server"
author = "agent"

[[workflows.workflow.tasks]]
task = "shell.exec"
args = "python tipg_main.py"
waitForPort = 5000

[deployment]
run = ["sh", "-c", "python tipg_main.py"]

[[ports]]
localPort = 5000
externalPort = 80
```

### Configuration Breakdown

#### Modules and Environment
- **Python 3.11**: Latest stable Python runtime
- **PostgreSQL 16**: Database with PostGIS spatial extensions
- **Nix Channel**: Stable package channel for reproducible builds

#### Workflow Automation
- **Run Button**: Single-click server startup
- **Port Waiting**: Ensures database is ready before starting server
- **Parallel Execution**: Optimized for development workflow

#### Deployment Configuration
- **Production Command**: `python tipg_main.py`
- **Port Mapping**: Internal port 5000 mapped to external port 80
- **Automatic SSL**: HTTPS enabled by default in production

## Manual Replit Setup (Alternative)

If you prefer manual configuration or want to understand the process:

### 1. Database Configuration
Replit provides PostgreSQL with PostGIS automatically configured:
```python
# Database connection is available via environment variables
DATABASE_URL = os.getenv("DATABASE_URL")  # Automatically configured
PGHOST = os.getenv("PGHOST")              # Replit PostgreSQL host
PGPORT = os.getenv("PGPORT", "5432")      # Standard PostgreSQL port
PGUSER = os.getenv("PGUSER")              # Auto-configured user
PGPASSWORD = os.getenv("PGPASSWORD")      # Auto-configured password
PGDATABASE = os.getenv("PGDATABASE")      # Auto-configured database
```

### 2. Dependencies Installation
Dependencies are automatically managed through the `.replit` configuration:

**Automatic Installation** (via `.replit`):
- Python packages installed from `pyproject.toml`
- Nix packages for system dependencies
- PostgreSQL client libraries

**Manual Installation** (if needed):
```bash
# Install core dependencies
pip install tipg fastapi uvicorn asyncpg psycopg2-binary

# Install testing dependencies
pip install pytest pytest-asyncio requests
```

### 3. Environment Variables
Replit automatically provides these environment variables:
```bash
DATABASE_URL=postgresql://username:password@host:port/database
PGHOST=host.database.replit.com
PGPORT=5432
PGUSER=username
PGPASSWORD=password
PGDATABASE=database_name
```

#### 3. Configure PostgreSQL for Production
Edit `/etc/postgresql/13/main/postgresql.conf`:
```ini
# Memory settings
shared_buffers = 2GB                # 25% of RAM
work_mem = 256MB                    # For spatial operations
maintenance_work_mem = 512MB        # For index creation

# Connection settings
max_connections = 200               # Adjust based on load
max_prepared_transactions = 200

# Performance settings
effective_cache_size = 6GB          # 75% of RAM
random_page_cost = 1.1             # For SSD storage
checkpoint_completion_target = 0.9

# Logging
log_min_duration_statement = 1000   # Log slow queries
log_checkpoints = on
log_connections = on
log_disconnections = on
```

Edit `/etc/postgresql/13/main/pg_hba.conf`:
```ini
# Allow connections from application server
host    vector_tiles_db    tipg_user    10.0.0.0/8    md5
host    vector_tiles_db    tipg_user    172.16.0.0/12 md5
host    vector_tiles_db    tipg_user    192.168.0.0/16 md5
```

### 4. Start the Server

**Using Run Button** (Recommended):
```
1. Click the "Run" button in Replit
2. The .replit workflow automatically executes
3. Server starts on port 5000 with port mapping to 80
4. Database connection established automatically
```

**Manual Startup**:
```bash
# Simple startup command
python tipg_main.py

# The server will automatically:
# - Connect to Replit's PostgreSQL database
# - Load environment variables
# - Start on port 5000 (mapped to port 80 externally)
# - Enable hot reloading for development
```

**Workflow Benefits**:
- Consistent environment across all deployments
- Automatic port management
- Database readiness checking
- Production-ready configuration

### 5. Load Test Data
```python
# Run the test data loader
python -c "
from tests.conftest_tipg import setup_tipg_test_data
setup_tipg_test_data()
print('✓ Official TiPG test data loaded successfully')
"

# Verify data loading
python -c "
import os, psycopg2
conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()
cur.execute('SELECT COUNT(*) FROM public.landsat_wrs;')
count = cur.fetchone()[0]
print(f'✓ Loaded {count:,} Landsat features')
conn.close()
"
```

## Replit-Specific Configuration

### Port Configuration
```python
# tipg_main.py - Replit optimized
import os

# Replit always uses port 5000 for web services
port = int(os.getenv("PORT", 5000))
host = "0.0.0.0"  # Required for Replit external access

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=host, port=port)
```

### Database Connection
```python
# Replit provides managed PostgreSQL
DATABASE_URL = os.getenv("DATABASE_URL")
# Format: postgresql://user:pass@host:port/db

# No manual database setup required
# PostGIS extension is pre-installed
```

#### 3. Load Spatial Data
```bash
# Activate virtual environment
source /opt/tipg/venv/bin/activate

# Load test data (optional)
python -c "
import psycopg2
import os

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
conn.autocommit = True
cur = conn.cursor()

# Load your spatial data here
# cur.execute(open('data/your_spatial_data.sql').read())
"

# Verify data loaded
psql $DATABASE_URL -c "SELECT COUNT(*) FROM geometry_columns;"
```

## Production Deployment on Replit

### Replit Deployments (One-Click Production)

For production deployment, use Replit's built-in deployment system:

#### 1. Enable Replit Deployments
```
1. Click "Deploy" in your Repl
2. Choose "Autoscale" or "Reserved VM" deployment
3. The .replit configuration handles:
   - Runtime environment (Python 3.11)
   - Database setup (PostgreSQL 16)
   - Port configuration (5000 → 80)
   - Startup command (python tipg_main.py)
4. Configure custom domain (optional)
```

#### 2. Automatic Scaling
Replit Deployments provide:
- **Auto-scaling**: Handle traffic spikes automatically
- **SSL/TLS**: HTTPS enabled by default
- **Custom Domains**: Optional custom domain support
- **Health Monitoring**: Automatic restart on failures
- **Load Balancing**: Distributed across multiple regions

#### 3. Production Configuration
```python
# Environment variables for production
TIPG_DEBUG=FALSE
TIPG_CORS_ORIGINS=https://yourdomain.com
TIPG_MAX_FEATURES_PER_QUERY=10000
TIPG_TILE_BUFFER=256

# Replit handles:
# - Database connection pooling
# - SSL certificate management
# - Load balancing
# - Health checks
```

#### 2. Nginx Configuration
Install and configure Nginx as reverse proxy:
```bash
sudo apt install nginx
```

Create `/etc/nginx/sites-available/tipg`:
```nginx
upstream tipg_backend {
    least_conn;
    server 127.0.0.1:8000 max_fails=3 fail_timeout=30s;
    # Add more backend servers for load balancing
    # server 127.0.0.1:8001 max_fails=3 fail_timeout=30s;
}

# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=tiles:10m rate=100r/s;

server {
    listen 80;
    server_name tiles.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tiles.yourdomain.com;
    
    # SSL configuration
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    
    # CORS headers for web mapping applications
    add_header Access-Control-Allow-Origin "*";
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
    add_header Access-Control-Allow-Headers "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range";
    
    # Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        application/json
        application/geo+json
        text/csv
        text/plain;
    
    # Tile caching
    location ~* ^/collections/.+/tiles/.+$ {
        limit_req zone=tiles burst=20 nodelay;
        
        # Cache tiles for 1 hour
        expires 1h;
        add_header Cache-Control "public, immutable";
        
        proxy_pass http://tipg_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeout settings for tile generation
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 120s;
    }
    
    # API endpoints
    location / {
        limit_req zone=api burst=10 nodelay;
        
        # Cache API responses for 5 minutes
        expires 5m;
        add_header Cache-Control "public";
        
        proxy_pass http://tipg_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Standard timeout settings
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 60s;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://tipg_backend;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/tipg /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Monitoring and Debugging on Replit

### Built-in Monitoring
Replit provides comprehensive monitoring without additional setup:

#### 1. Real-time Logs
```
- Access logs via Replit console
- Real-time application output
- Database query logging
- Error tracking and alerts
```

#### 2. Performance Metrics
```
- CPU and memory usage
- Database connection status
- Response time monitoring
- Request volume tracking
```

#### 3. Health Checks
```python
# Built-in health endpoint
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "database": "connected",
        "collections": len(await get_collections())
    }
```

#### 2. Log Configuration
Configure log rotation in `/etc/logrotate.d/tipg`:
```bash
/opt/tipg/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 tipg tipg
    postrotate
        systemctl reload tipg
    endscript
}
```

#### 3. Health Checks
Create health monitoring script `/opt/tipg/health_check.py`:
```python
#!/usr/bin/env python3
import requests
import sys
import time

def check_health():
    try:
        response = requests.get('http://localhost:8000/', timeout=10)
        if response.status_code == 200:
            print("✓ TiPG server healthy")
            return True
        else:
            print(f"✗ TiPG server returned {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ TiPG server health check failed: {e}")
        return False

if __name__ == "__main__":
    if not check_health():
        sys.exit(1)
```

### Performance Optimization

#### 1. Database Indexing
```sql
-- Ensure spatial indexes exist
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE indexdef LIKE '%gist%' AND indexdef LIKE '%geom%';

-- Create missing spatial indexes
CREATE INDEX CONCURRENTLY idx_table_geom ON schema.table USING GIST (geom);

-- Statistics and maintenance
ANALYZE;
VACUUM;
```

#### 2. Connection Pooling
Install and configure PgBouncer:
```bash
sudo apt install pgbouncer

# Edit /etc/pgbouncer/pgbouncer.ini
[databases]
vector_tiles_db = host=localhost port=5432 dbname=vector_tiles_db

[pgbouncer]
listen_port = 6432
listen_addr = 127.0.0.1
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 100
default_pool_size = 20
```

Update DATABASE_URL to use PgBouncer:
```bash
DATABASE_URL=postgresql://tipg_user:secure_password@localhost:6432/vector_tiles_db
```

### Backup and Recovery

#### 1. Database Backup
Create backup script `/opt/tipg/backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/opt/tipg/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="vector_tiles_db"

mkdir -p $BACKUP_DIR

# Full database backup
pg_dump -h localhost -U tipg_user -d $DB_NAME -F c -f $BACKUP_DIR/backup_$DATE.dump

# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup_*.dump" -mtime +7 -delete

echo "Backup completed: backup_$DATE.dump"
```

Add to crontab:
```bash
# Daily backup at 2 AM
0 2 * * * /opt/tipg/backup.sh
```

#### 2. Disaster Recovery
Document recovery procedures:
```bash
# Restore from backup
pg_restore -h localhost -U tipg_user -d vector_tiles_db -c backup_20231201_020000.dump

# Verify data integrity
psql -h localhost -U tipg_user -d vector_tiles_db -c "SELECT COUNT(*) FROM geometry_columns;"
```

### Scaling Considerations

#### 1. Horizontal Scaling
- Deploy multiple TiPG instances behind load balancer
- Use read replicas for PostgreSQL
- Implement tile caching with Redis or CDN
- Consider container orchestration with Docker/Kubernetes

#### 2. Vertical Scaling
- Increase server resources (CPU, RAM, SSD)
- Optimize PostgreSQL configuration
- Use faster storage (NVMe SSDs)
- Implement database partitioning for large datasets

### Security Hardening

#### 1. Network Security
```bash
# Configure firewall
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# Disable PostgreSQL external access
sudo ufw deny 5432
```

#### 2. Application Security
- Regular security updates
- Strong authentication for admin interfaces
- Input validation and sanitization
- Rate limiting and DDoS protection
- Regular security audits

## Troubleshooting on Replit

### Common Issues and Solutions

#### 1. Database Connection Issues
```python
# Check database status
import os, psycopg2

try:
    conn = psycopg2.connect(os.getenv('DATABASE_URL'))
    print("✓ Database connected successfully")
    conn.close()
except Exception as e:
    print(f"✗ Database connection failed: {e}")
```

#### 2. Port Configuration
```python
# Ensure server runs on port 5000
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))  # Replit requires port 5000
    uvicorn.run(app, host="0.0.0.0", port=port)
```

#### 3. Environment Variables
```bash
# Check Replit environment variables
echo $DATABASE_URL
echo $PGHOST
echo $PGUSER

# Verify PostGIS extension
python -c "
import psycopg2, os
conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()
cur.execute('SELECT PostGIS_Version();')
print('PostGIS Version:', cur.fetchone()[0])
conn.close()
"
```

### AI Agent Troubleshooting

When issues arise, the AI agent can help:

```
User: "My vector tile server isn't generating tiles properly"
AI Agent: 
1. Checks database connectivity
2. Verifies spatial indexes
3. Tests tile generation endpoints
4. Provides specific fix recommendations
```

### Debugging Commands
```bash
# Test server endpoints
curl https://your-repl.username.repl.co/
curl https://your-repl.username.repl.co/collections
curl https://your-repl.username.repl.co/conformance

# Run test suite
python -m pytest tests/test_tipg_phase1_basic.py -v

# Check spatial data
python -c "
import requests
r = requests.get('http://localhost:5000/collections/public.landsat_wrs/items?limit=1')
print('Sample feature:', r.json())
"
```

## Advanced Replit Features

### 1. Collaborative Development
- Real-time collaboration on code
- Shared database access
- Team debugging sessions
- Version control integration

### 2. Custom Domains
```
1. Access Replit Deployments
2. Configure custom domain
3. SSL certificates auto-generated
4. DNS configuration guided setup
```

### 3. Environment Management
```bash
# Development environment (handled by .replit)
TIPG_DEBUG=TRUE
TIPG_LOG_LEVEL=DEBUG

# Production environment (Replit Deployments)
TIPG_DEBUG=FALSE
TIPG_LOG_LEVEL=INFO
TIPG_CORS_ORIGINS=https://yourdomain.com
```

### 4. Replit Configuration Benefits
The `.replit` file provides:
- **Reproducible Builds**: Same environment every time
- **Zero Configuration**: No manual setup required
- **Optimized Performance**: Pre-configured for spatial data processing
- **Production Ready**: Seamless transition from development to production
- **Team Collaboration**: Consistent environment for all team members

---

## Why Choose Replit + AI Agent?

- **Zero Infrastructure**: No server management required
- **Instant Scaling**: From prototype to production seamlessly  
- **AI-Powered**: Development assistance at every step
- **Cost Effective**: Pay only for what you use
- **Global CDN**: Fast performance worldwide
- **SSL by Default**: Security built-in