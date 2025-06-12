# Successfully Installing GDAL and Rasterio on Replit

This guide documents the successful approach to installing GDAL and rasterio on Replit, which can be challenging due to system dependencies.

## The Challenge

Installing GDAL and rasterio on Replit presents several unique challenges:

1. GDAL requires specific system libraries that aren't available by default in the Replit environment
2. Errors like `libexpat.so.1: cannot open shared object file: No such file or directory` indicate missing system dependencies
3. Typical installation methods like `pip install gdal` or `pip install rasterio` fail because they require these system libraries

## Successful Installation Approach

### Step 1: Install System Dependencies First

The key breakthrough was installing the required system dependencies using Replit's package manager **before** attempting to install the Python libraries:

```python
# Use Replit's package manager to install system dependencies
# This installs both the expat library (needed for XML parsing) and GDAL itself
packager_tool install system ["expat", "gdal"]
```

This step installs the necessary system libraries:
- `expat`: XML parsing library required by GDAL
- `gdal`: The core GDAL system libraries and executables

### Step 2: Verify GDAL Installation

After installing the system dependencies, verify that GDAL is available at the system level:

```python
# Import the GDAL Python bindings
from osgeo import gdal
print(f"GDAL version: {gdal.VersionInfo()}")
```

If successful, this will output the GDAL version number (e.g., `"GDAL version: 3110000"` for GDAL 3.11.0).

### Step 3: Install Rasterio

Once GDAL is successfully installed at the system level, installing rasterio becomes straightforward:

```python
# Install rasterio using Replit's package manager
packager_tool install python ["rasterio"]
```

### Step 4: Verify Rasterio Installation

Verify that rasterio is installed correctly:

```python
# Import rasterio and check its version
import rasterio
print(f"rasterio version: {rasterio.__version__}")
```

This should output something like `"rasterio version: 1.4.3"`.

## PostgreSQL Configuration for titiler-pgstac

For titiler-pgstac to work properly, your PostgreSQL database needs specific extensions and permissions:

### Required PostgreSQL Extensions

```sql
-- Install required extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

### Setting Up Search Path

```sql
-- Configure search path for user and database
ALTER USER your_username SET search_path TO pgstac, public;
ALTER DATABASE your_database SET search_path to pgstac, public;
```

### Required Permissions

```sql
-- Grant database ownership and connection permissions
ALTER DATABASE your_database OWNER TO your_username;
GRANT CONNECT ON DATABASE your_database TO your_username;

-- Grant pgstac roles (these must be created by pgstac installation)
GRANT pgstac_read TO your_username;
GRANT pgstac_ingest TO your_username;
GRANT pgstac_admin TO your_username;

-- Grant privileges for all tables in public schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_username;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_username;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT ALL PRIVILEGES ON TABLES TO your_username;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT ALL PRIVILEGES ON SEQUENCES TO your_username;
```

### Python Script for Database Configuration

We've created a Python script (`setup_pgstac_permissions.py`) that automates this setup process. Run it after installing GDAL and rasterio:

```python
python setup_pgstac_permissions.py
```

## Complete Installation Script

Here's a complete script that demonstrates the installation process:

```python
import subprocess
import sys

def install_system_dependencies():
    """Install required system dependencies for GDAL."""
    print("Installing system dependencies (expat, gdal)...")
    
    # This uses Replit's package manager
    # In a normal environment, you would use apt-get or similar
    subprocess.run([
        "packager_tool", "install", "system", 
        '["expat", "gdal"]'
    ], check=True)
    
    print("System dependencies installed successfully!")

def test_gdal():
    """Test if GDAL is properly installed."""
    print("Testing GDAL installation...")
    
    try:
        from osgeo import gdal
        print(f"GDAL version: {gdal.VersionInfo()}")
        print(f"GDAL release name: {gdal.VersionInfo('RELEASE_NAME')}")
        return True
    except ImportError as e:
        print(f"GDAL import error: {e}")
        return False
    except Exception as e:
        print(f"GDAL test error: {e}")
        return False

def install_rasterio():
    """Install rasterio after GDAL is installed."""
    print("Installing rasterio...")
    
    # Using Replit's package manager
    # In a normal environment, you would use pip
    subprocess.run([
        "packager_tool", "install", "python", 
        '["rasterio"]'
    ], check=True)
    
    print("rasterio installed successfully!")

def test_rasterio():
    """Test if rasterio is properly installed."""
    print("Testing rasterio installation...")
    
    try:
        import rasterio
        print(f"rasterio version: {rasterio.__version__}")
        return True
    except ImportError as e:
        print(f"rasterio import error: {e}")
        return False
    except Exception as e:
        print(f"rasterio test error: {e}")
        return False

def setup_postgresql():
    """Set up PostgreSQL for titiler-pgstac."""
    print("Setting up PostgreSQL for titiler-pgstac...")
    
    try:
        # Run the PostgreSQL setup script
        subprocess.run([
            "python", "setup_pgstac_permissions.py"
        ], check=True)
        
        print("PostgreSQL setup completed successfully!")
        return True
    except Exception as e:
        print(f"PostgreSQL setup error: {e}")
        return False

def main():
    """Main installation function."""
    print("Starting GDAL, rasterio, and PostgreSQL installation...")
    
    # Step 1: Install system dependencies
    install_system_dependencies()
    
    # Step 2: Test GDAL
    if not test_gdal():
        print("GDAL installation failed!")
        sys.exit(1)
    
    # Step 3: Install rasterio
    install_rasterio()
    
    # Step 4: Test rasterio
    if not test_rasterio():
        print("rasterio installation failed!")
        sys.exit(1)
    
    # Step 5: Set up PostgreSQL
    setup_postgresql()
    
    print("Installation completed successfully!")
    print("You can now proceed with installing titiler-pgstac.")

if __name__ == "__main__":
    main()
```

## Why This Works

1. **Correct order of installation**: System dependencies must be installed before Python packages
2. **Using the right package manager**: Replit's package manager provides access to system libraries
3. **Comprehensive dependencies**: Installing both `expat` and `gdal` ensures all necessary libraries are available
4. **Proper PostgreSQL setup**: Configuring PostgreSQL with the necessary extensions and permissions

## Common Errors and Solutions

### 1. Missing Library Errors

Error: `ImportError: libexpat.so.1: cannot open shared object file: No such file or directory`

Solution: Install the missing library using the system package manager:
```python
packager_tool install system ["expat"]
```

### 2. GDAL Version Mismatch

Error: `ImportError: cannot import name 'xxx' from 'osgeo.gdal'`

Solution: Ensure the Python bindings match the installed GDAL version:
```python
# Check system GDAL version
subprocess.run(["gdal-config", "--version"])

# Use matching version when installing Python bindings
```

### 3. Rasterio Dependencies

Error: `ImportError: cannot import name 'xxx' from 'rasterio._xxx'`

Solution: Ensure GDAL is correctly installed before installing rasterio.

### 4. PostgreSQL Permission Issues

Error: `ERROR: permission denied to create extension "postgis"`

Solution: Ensure your database user has superuser privileges or use a user that has appropriate permissions.

### 5. Missing pgstac Schema

Error: `ERROR: schema "pgstac" does not exist`

Solution: Create the pgstac schema first:
```sql
CREATE SCHEMA IF NOT EXISTS pgstac;
```

## Additional Tips

1. **Environment Variables**: Sometimes setting environment variables helps:
   ```python
   os.environ["SKIP_GDAL_DATA_CHECK"] = "1"  # Prevents looking for data files
   ```

2. **Alternative approach**: If direct installation doesn't work, you can try using prebuilt wheels:
   ```python
   # Using prebuilt wheels
   subprocess.run([
       "uv", "pip", "install", 
       "--extra-index-url", "https://gitlab.com/api/v4/projects/61637378/packages/pypi/simple/",
       "gdal"
   ], check=True)
   ```

3. **PostgreSQL Integration**: For projects like titiler-pgstac, the proper order is:
   1. Set up PostgreSQL with extensions
   2. Install and configure pgstac
   3. Install titiler-pgstac Python package
   4. Configure proper database connection in your application

## Conclusion

Successfully installing GDAL and rasterio on Replit requires installing the system dependencies first, followed by the Python packages, and finally configuring PostgreSQL correctly. This comprehensive approach enables the full functionality of titiler-pgstac in the Replit environment.