# Replit Configuration Reference

## Overview

The `.replit` configuration file is the heart of the TiPG vector tile server deployment on Replit. It defines the complete runtime environment, dependencies, and deployment workflow.

## Complete Configuration

```toml
modules = ["python-3.11", "postgresql-16"]

[nix]
channel = "stable-24_05"
packages = ["libiconv", "libxcrypt", "postgresql"]

[workflows]
runButton = "Project"

[[workflows.workflow]]
name = "Project"
mode = "parallel"
author = "agent"

[[workflows.workflow.tasks]]
task = "workflow.run"
args = "TiPG Native Server"

[[workflows.workflow.tasks]]
task = "workflow.run"
args = "TiPG Server"

[[workflows.workflow]]
name = "TiPG Native Server"
author = "agent"

[[workflows.workflow.tasks]]
task = "shell.exec"
args = "python tipg_main.py"
waitForPort = 5000

[[workflows.workflow]]
name = "TiPG Server"
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

## Configuration Sections Explained

### 1. Modules
```toml
modules = ["python-3.11", "postgresql-16"]
```
Defines the core runtime environment:
- **python-3.11**: Latest stable Python runtime with spatial libraries
- **postgresql-16**: PostgreSQL database with PostGIS spatial extensions

### 2. Nix Environment
```toml
[nix]
channel = "stable-24_05"
packages = ["libiconv", "libxcrypt", "postgresql"]
```
System-level dependencies for spatial data processing:
- **stable-24_05**: Stable Nix channel for reproducible builds
- **libiconv**: Character encoding conversion for spatial data
- **libxcrypt**: Cryptographic functions
- **postgresql**: PostgreSQL client libraries

### 3. Workflows
```toml
[workflows]
runButton = "Project"

[[workflows.workflow]]
name = "Project"
mode = "parallel"
author = "agent"
```
Defines automation for development and deployment:
- **runButton**: "Run" button executes the "Project" workflow
- **mode = "parallel"**: Enables concurrent task execution
- **author = "agent"**: Indicates AI agent-generated configuration

### 4. Task Definitions
```toml
[[workflows.workflow.tasks]]
task = "shell.exec"
args = "python tipg_main.py"
waitForPort = 5000
```
Individual workflow tasks:
- **shell.exec**: Execute shell command
- **args**: Command to run the TiPG server
- **waitForPort**: Ensures port 5000 is ready before proceeding

### 5. Deployment Configuration
```toml
[deployment]
run = ["sh", "-c", "python tipg_main.py"]
```
Production deployment command:
- **run**: Command executed in production environment
- **sh -c**: Shell execution wrapper for compatibility

### 6. Port Mapping
```toml
[[ports]]
localPort = 5000
externalPort = 80
```
Network configuration:
- **localPort**: Internal application port
- **externalPort**: External access port (HTTP standard)

## Development Workflow

### Automatic Startup
When you click "Run" in Replit:
1. Nix environment is prepared with all dependencies
2. PostgreSQL 16 with PostGIS is initialized
3. Python 3.11 environment is activated
4. TiPG server starts on port 5000
5. Port mapping makes it accessible via port 80

### Hot Reloading
The configuration enables development features:
- Automatic code reloading on file changes
- Environment variable updates without restart
- Database connection persistence

## Production Deployment

### Replit Deployments Integration
The `.replit` file integrates seamlessly with Replit Deployments:
- Production environment mirrors development exactly
- Automatic scaling based on traffic
- SSL/TLS termination handled automatically
- Health checks use the configured port

### Environment Variables
Production environment variables are managed separately:
```bash
# Automatically provided by Replit
DATABASE_URL=postgresql://user:pass@host:port/db
PGHOST=db.host.replit.com
PGPORT=5432

# Optional production overrides
TIPG_DEBUG=FALSE
TIPG_CORS_ORIGINS=https://yourdomain.com
```

## Customization Options

### Adding Dependencies
To add system dependencies:
```toml
[nix]
packages = ["libiconv", "libxcrypt", "postgresql", "gdal", "proj"]
```

### Custom Workflows
Add development helpers:
```toml
[[workflows.workflow]]
name = "Run Tests"
author = "agent"

[[workflows.workflow.tasks]]
task = "shell.exec"
args = "python -m pytest tests/ -v"
```

### Multiple Environments
Configure different startup commands:
```toml
[[workflows.workflow]]
name = "Development Server"
[[workflows.workflow.tasks]]
task = "shell.exec"
args = "python tipg_main.py --debug"

[[workflows.workflow]]
name = "Production Server"
[[workflows.workflow.tasks]]
task = "shell.exec"
args = "python tipg_main.py --production"
```

## Troubleshooting Configuration

### Common Issues

#### 1. Port Conflicts
If you see "Address already in use":
```toml
# Ensure only one server task is active
[[workflows.workflow]]
name = "TiPG Server"
# Remove duplicate workflow definitions
```

#### 2. Database Connection
Verify PostgreSQL module is loaded:
```toml
modules = ["python-3.11", "postgresql-16"]
# postgresql-16 must be included
```

#### 3. Dependency Issues
Check Nix packages are available:
```toml
[nix]
channel = "stable-24_05"
packages = ["postgresql", "libiconv"]
# Use stable channel for compatibility
```

### Validation Commands
Test configuration validity:
```bash
# Check if modules loaded correctly
replit modules list

# Verify PostgreSQL availability
which psql

# Test Python environment
python --version
python -c "import psycopg2; print('PostgreSQL driver available')"
```

## Best Practices

### 1. Version Pinning
Always specify exact versions:
```toml
modules = ["python-3.11", "postgresql-16"]
# Not: ["python", "postgresql"]
```

### 2. Minimal Dependencies
Include only necessary packages:
```toml
[nix]
packages = ["libiconv", "libxcrypt", "postgresql"]
# Avoid unnecessary packages that increase startup time
```

### 3. Workflow Organization
Keep workflows focused:
```toml
# Good: Single purpose workflows
[[workflows.workflow]]
name = "Start Server"

# Avoid: Multi-purpose workflows that are hard to debug
```

### 4. Port Consistency
Use standard ports:
```toml
[[ports]]
localPort = 5000   # Standard development port
externalPort = 80  # Standard HTTP port
```

## Integration with AI Agent

The `.replit` configuration is designed to work seamlessly with Replit's AI agent:

- **Agent Recognition**: `author = "agent"` indicates AI-generated workflows
- **Automation Support**: Clear task definitions for AI understanding
- **Debugging Assistance**: Structured configuration for AI troubleshooting
- **Iteration Support**: Easy modification for AI-driven improvements

When working with the AI agent, the configuration provides:
- Predictable environment setup
- Clear task execution paths
- Standardized deployment process
- Consistent development experience

This ensures that both manual users and AI agents can reliably deploy and manage the TiPG vector tile server on Replit.