# Testing Procedures and Validation

## Overview

This document outlines comprehensive testing procedures developed throughout the project iterations, including unit tests, integration tests, performance validation, and deployment verification.

## Test Suite Architecture

### Test Categories

#### 1. Infrastructure Tests
- GDAL installation verification
- Database connectivity validation
- Nginx proxy configuration testing
- Service orchestration verification

#### 2. Application Tests
- API endpoint functionality
- URL generation correctness
- Data processing capabilities
- Error handling validation

#### 3. Integration Tests
- End-to-end workflow testing
- Cross-service communication
- Data pipeline validation
- Performance benchmarking

#### 4. Deployment Tests
- Production readiness checks
- Security validation
- Scalability testing
- Monitoring verification

## Infrastructure Testing

### GDAL Installation Tests

#### Core GDAL Functionality (`test_gdal_installation.py`)
```python
#!/usr/bin/env python3
"""
Comprehensive GDAL installation testing suite.
Validates all aspects of GDAL functionality on Replit.
"""
import pytest
import subprocess
import sys
import os
from pathlib import Path

class TestGDALInstallation:
    
    def test_gdal_import(self):
        """Test basic GDAL import functionality."""
        try:
            from osgeo import gdal, osr, ogr
            assert gdal is not None
            assert osr is not None
            assert ogr is not None
        except ImportError as e:
            pytest.fail(f"GDAL import failed: {e}")
    
    def test_gdal_version(self):
        """Verify GDAL version meets requirements."""
        from osgeo import gdal
        version = gdal.__version__
        major, minor = version.split('.')[:2]
        assert int(major) >= 3, f"GDAL version {version} too old, need 3.x+"
        assert int(minor) >= 4, f"GDAL version {version} too old, need 3.4+"
    
    def test_gdal_drivers(self):
        """Test GDAL driver availability."""
        from osgeo import gdal
        driver_count = gdal.GetDriverCount()
        assert driver_count > 50, f"Only {driver_count} drivers available"
        
        # Test specific required drivers
        required_drivers = ['GTiff', 'PNG', 'JPEG', 'netCDF', 'HDF5']
        for driver_name in required_drivers:
            driver = gdal.GetDriverByName(driver_name)
            assert driver is not None, f"Required driver {driver_name} not found"
    
    def test_coordinate_transformation(self):
        """Test coordinate system transformations."""
        from osgeo import osr
        
        # Create source and target coordinate systems
        source = osr.SpatialReference()
        source.ImportFromEPSG(4326)  # WGS84
        
        target = osr.SpatialReference()
        target.ImportFromEPSG(3857)  # Web Mercator
        
        # Create transformation
        transform = osr.CoordinateTransformation(source, target)
        
        # Test transformation (San Francisco coordinates)
        lon, lat = -122.4194, 37.7749
        x, y, z = transform.TransformPoint(lon, lat)
        
        # Verify transformation results
        assert abs(x - (-13627065.85)) < 1000, f"X coordinate transformation incorrect: {x}"
        assert abs(y - 4546503.73) < 1000, f"Y coordinate transformation incorrect: {y}"
    
    def test_rasterio_integration(self):
        """Test rasterio integration with GDAL."""
        try:
            import rasterio
            from rasterio.crs import CRS
            from rasterio.transform import from_bounds
            
            # Test CRS creation
            crs = CRS.from_epsg(4326)
            assert crs.is_geographic
            
            # Test transform creation
            transform = from_bounds(-180, -90, 180, 90, 360, 180)
            assert transform is not None
            
        except ImportError as e:
            pytest.fail(f"Rasterio import failed: {e}")
    
    def test_environment_variables(self):
        """Test GDAL environment variable configuration."""
        # Check GDAL_DATA
        gdal_data = os.environ.get('GDAL_DATA')
        if gdal_data:
            assert Path(gdal_data).exists(), f"GDAL_DATA path does not exist: {gdal_data}"
        
        # Check PROJ_LIB
        proj_lib = os.environ.get('PROJ_LIB')
        if proj_lib:
            assert Path(proj_lib).exists(), f"PROJ_LIB path does not exist: {proj_lib}"
```

### Database Connectivity Tests

#### PostgreSQL and pgSTAC Tests (`test_database_connectivity.py`)
```python
#!/usr/bin/env python3
"""
Database connectivity and pgSTAC functionality tests.
"""
import pytest
import asyncio
import psycopg
import os
import json
from datetime import datetime

class TestDatabaseConnectivity:
    
    @pytest.fixture
    def connection_string(self):
        """Get database connection string from environment."""
        return os.environ.get("DATABASE_URL")
    
    def test_basic_connection(self, connection_string):
        """Test basic PostgreSQL connection."""
        assert connection_string, "DATABASE_URL not set"
        
        try:
            with psycopg.connect(connection_string) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    result = cur.fetchone()
                    assert result[0] == 1
        except Exception as e:
            pytest.fail(f"Database connection failed: {e}")
    
    def test_postgis_extension(self, connection_string):
        """Test PostGIS extension availability."""
        with psycopg.connect(connection_string) as conn:
            with conn.cursor() as cur:
                # Check PostGIS version
                cur.execute("SELECT PostGIS_Version()")
                version = cur.fetchone()[0]
                assert version is not None, "PostGIS not installed"
                
                # Test basic geometry operations
                cur.execute("""
                    SELECT ST_AsText(ST_Point(-122.4194, 37.7749))
                """)
                point = cur.fetchone()[0]
                assert "POINT(-122.4194 37.7749)" in point
    
    def test_pgstac_extension(self, connection_string):
        """Test pgSTAC extension functionality."""
        with psycopg.connect(connection_string) as conn:
            with conn.cursor() as cur:
                # Check pgSTAC version
                cur.execute("SELECT pgstac_version()")
                version = cur.fetchone()[0]
                assert version is not None, "pgSTAC not installed"
                
                # Check pgSTAC schema exists
                cur.execute("""
                    SELECT COUNT(*) FROM information_schema.tables 
                    WHERE table_schema = 'pgstac'
                """)
                table_count = cur.fetchone()[0]
                assert table_count > 0, "pgSTAC schema not found"
    
    def test_stac_collection_operations(self, connection_string):
        """Test STAC collection CRUD operations."""
        test_collection = {
            "id": "test-collection-" + str(int(datetime.now().timestamp())),
            "type": "Collection",
            "title": "Test Collection",
            "description": "Test collection for validation",
            "extent": {
                "spatial": {"bbox": [[-180, -90, 180, 90]]},
                "temporal": {"interval": [["2020-01-01T00:00:00Z", None]]}
            },
            "license": "public-domain"
        }
        
        with psycopg.connect(connection_string) as conn:
            with conn.cursor() as cur:
                # Create collection
                cur.execute(
                    "SELECT * FROM pgstac.create_collection(%s)",
                    (json.dumps(test_collection),)
                )
                
                # Retrieve collection
                cur.execute(
                    "SELECT * FROM pgstac.get_collection(%s)",
                    (test_collection["id"],)
                )
                result = cur.fetchone()
                assert result is not None, "Failed to retrieve created collection"
                
                # Delete collection
                cur.execute(
                    "SELECT * FROM pgstac.delete_collection(%s)",
                    (test_collection["id"],)
                )
    
    def test_connection_pool_performance(self, connection_string):
        """Test connection pool performance under load."""
        import concurrent.futures
        import time
        
        def test_query():
            with psycopg.connect(connection_string) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT pg_sleep(0.1), 1")
                    return cur.fetchone()[1]
        
        start_time = time.time()
        
        # Test concurrent connections
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(test_query) for _ in range(20)]
            results = [future.result() for future in futures]
        
        duration = time.time() - start_time
        
        assert all(r == 1 for r in results), "Some queries failed"
        assert duration < 5.0, f"Connection pool too slow: {duration}s"
```

### Nginx Proxy Tests

#### Proxy Configuration Tests (`test_nginx_proxy.py`)
```python
#!/usr/bin/env python3
"""
Nginx proxy configuration and functionality tests.
"""
import pytest
import requests
import time
import subprocess
import os
from urllib.parse import urljoin

class TestNginxProxy:
    
    @pytest.fixture(scope="class")
    def nginx_url(self):
        """Get Nginx proxy URL."""
        return "http://127.0.0.1:8000"
    
    @pytest.fixture(scope="class")
    def backend_url(self):
        """Get backend TiTiler URL."""
        return "http://127.0.0.1:8001"
    
    def test_nginx_config_valid(self):
        """Test Nginx configuration validity."""
        result = subprocess.run([
            "nginx", "-t", "-c", os.path.abspath("nginx.conf")
        ], capture_output=True, text=True)
        
        assert result.returncode == 0, f"Nginx config invalid: {result.stderr}"
    
    def test_proxy_health_check(self, nginx_url):
        """Test proxy health check endpoint."""
        response = requests.get(f"{nginx_url}/health", timeout=10)
        assert response.status_code == 200
        assert "healthy" in response.text.lower()
    
    def test_proxy_headers(self, nginx_url):
        """Test proxy header forwarding."""
        response = requests.get(f"{nginx_url}/health/proxy", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        proxy_headers = data["proxy_headers"]
        
        # Check required headers are present
        assert proxy_headers.get("x-forwarded-proto") is not None
        assert proxy_headers.get("host") is not None
    
    def test_url_generation(self, nginx_url):
        """Test proper HTTPS URL generation through proxy."""
        response = requests.get(f"{nginx_url}/", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        base_url = data.get("base_url", "")
        
        # Should generate HTTPS URLs when X-Forwarded-Proto is set
        if "x-forwarded-proto" in str(response.request.headers).lower():
            assert base_url.startswith("https://"), f"Expected HTTPS URL, got: {base_url}"
    
    def test_proxy_performance(self, nginx_url, backend_url):
        """Test proxy performance vs direct backend."""
        # Test direct backend
        start_time = time.time()
        backend_response = requests.get(f"{backend_url}/health", timeout=10)
        backend_time = time.time() - start_time
        
        # Test through proxy
        start_time = time.time()
        proxy_response = requests.get(f"{nginx_url}/health", timeout=10)
        proxy_time = time.time() - start_time
        
        assert backend_response.status_code == 200
        assert proxy_response.status_code == 200
        
        # Proxy should add minimal overhead (<100ms)
        overhead = proxy_time - backend_time
        assert overhead < 0.1, f"Proxy overhead too high: {overhead}s"
    
    def test_static_file_serving(self, nginx_url):
        """Test static file serving configuration."""
        # Test that static files are handled by Nginx
        response = requests.head(f"{nginx_url}/static/test.css", timeout=10)
        # Should return 404 for non-existent file, not 502 (backend error)
        assert response.status_code in [404, 200], f"Unexpected status: {response.status_code}"
    
    def test_error_handling(self, nginx_url):
        """Test proxy error handling."""
        # Test non-existent endpoint
        response = requests.get(f"{nginx_url}/non-existent-endpoint", timeout=10)
        assert response.status_code in [404, 502], "Error handling not working"
        
        # Should return JSON error for API endpoints
        if response.headers.get("content-type", "").startswith("application/json"):
            data = response.json()
            assert "error" in data, "Error response should contain error field"
```

## Application Testing

### API Endpoint Tests

#### TiTiler API Tests (`test_api_endpoints.py`)
```python
#!/usr/bin/env python3
"""
TiTiler API endpoint functionality tests.
"""
import pytest
import requests
import json
from urllib.parse import urljoin

class TestAPIEndpoints:
    
    @pytest.fixture
    def base_url(self):
        """Get base API URL."""
        return "http://127.0.0.1:8000"
    
    def test_root_endpoint(self, base_url):
        """Test root API endpoint."""
        response = requests.get(base_url, timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert "title" in data
        assert "endpoints" in data
    
    def test_health_endpoint(self, base_url):
        """Test health check endpoint."""
        response = requests.get(f"{base_url}/health", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] in ["healthy", "degraded"]
        assert "services" in data
        assert "timestamp" in data
    
    def test_collections_endpoint(self, base_url):
        """Test collections listing endpoint."""
        response = requests.get(f"{base_url}/collections", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert "collections" in data or isinstance(data, list)
    
    def test_openapi_schema(self, base_url):
        """Test OpenAPI schema generation."""
        response = requests.get(f"{base_url}/openapi.json", timeout=10)
        assert response.status_code == 200
        
        schema = response.json()
        assert "openapi" in schema
        assert "info" in schema
        assert "paths" in schema
    
    def test_docs_endpoint(self, base_url):
        """Test API documentation endpoint."""
        response = requests.get(f"{base_url}/docs", timeout=10)
        assert response.status_code == 200
        assert "swagger" in response.text.lower() or "openapi" in response.text.lower()
    
    def test_multidimensional_endpoints(self, base_url):
        """Test multidimensional data endpoints."""
        # Test NOAA dataset info
        response = requests.get(f"{base_url}/test/noaa-dataset", timeout=30)
        assert response.status_code == 200
        
        data = response.json()
        assert "variables" in data
        assert "dimensions" in data
        assert len(data["variables"]) > 0
    
    def test_error_responses(self, base_url):
        """Test API error response handling."""
        # Test 404 for non-existent collection
        response = requests.get(f"{base_url}/collections/non-existent", timeout=10)
        assert response.status_code == 404
        
        # Should return JSON error response
        if response.headers.get("content-type", "").startswith("application/json"):
            data = response.json()
            assert "detail" in data or "error" in data
    
    def test_cors_headers(self, base_url):
        """Test CORS header configuration."""
        response = requests.options(base_url, timeout=10)
        
        headers = response.headers
        assert "access-control-allow-origin" in headers or response.status_code == 200
    
    def test_rate_limiting(self, base_url):
        """Test API rate limiting behavior."""
        # Make multiple rapid requests
        responses = []
        for _ in range(10):
            response = requests.get(f"{base_url}/health", timeout=5)
            responses.append(response.status_code)
        
        # Should not block legitimate requests
        success_count = sum(1 for status in responses if status == 200)
        assert success_count >= 8, f"Too many requests blocked: {responses}"
```

### Data Processing Tests

#### Geospatial Data Tests (`test_data_processing.py`)
```python
#!/usr/bin/env python3
"""
Geospatial data processing and transformation tests.
"""
import pytest
import numpy as np
import xarray as xr
from unittest.mock import patch, MagicMock

class TestDataProcessing:
    
    def test_zarr_dataset_access(self):
        """Test Zarr dataset access and processing."""
        # Create mock dataset for testing
        mock_dataset = xr.Dataset({
            'temperature': (('time', 'lat', 'lon'), 
                          np.random.rand(10, 180, 360)),
            'precipitation': (('time', 'lat', 'lon'), 
                           np.random.rand(10, 180, 360))
        }, coords={
            'time': pd.date_range('2024-01-01', periods=10),
            'lat': np.linspace(-90, 90, 180),
            'lon': np.linspace(-180, 180, 360)
        })
        
        # Test dataset structure
        assert 'temperature' in mock_dataset.variables
        assert 'precipitation' in mock_dataset.variables
        assert mock_dataset.dims['lat'] == 180
        assert mock_dataset.dims['lon'] == 360
    
    def test_coordinate_transformation(self):
        """Test coordinate system transformations."""
        from rasterio.warp import transform_bounds
        
        # Transform from WGS84 to Web Mercator
        bounds = transform_bounds(
            'EPSG:4326', 'EPSG:3857',
            -180, -90, 180, 90
        )
        
        # Verify transformation results
        assert len(bounds) == 4
        assert bounds[0] < bounds[2]  # left < right
        assert bounds[1] < bounds[3]  # bottom < top
    
    def test_tile_generation_logic(self):
        """Test tile generation logic."""
        # Mock tile parameters
        tile_z, tile_x, tile_y = 5, 10, 15
        
        # Calculate tile bounds (simplified)
        def tile_to_bounds(z, x, y):
            n = 2.0 ** z
            lon_deg = x / n * 360.0 - 180.0
            lat_rad = np.arctan(np.sinh(np.pi * (1 - 2 * y / n)))
            lat_deg = np.degrees(lat_rad)
            return lon_deg, lat_deg
        
        bounds = tile_to_bounds(tile_z, tile_x, tile_y)
        assert len(bounds) == 2
        assert -180 <= bounds[0] <= 180
        assert -90 <= bounds[1] <= 90
    
    def test_colormap_application(self):
        """Test colormap application to data."""
        # Create test data
        data = np.random.rand(256, 256)
        
        # Apply normalization
        normalized = (data - data.min()) / (data.max() - data.min())
        assert 0 <= normalized.min() <= normalized.max() <= 1
        
        # Test colormap range
        colormap_values = normalized * 255
        assert 0 <= colormap_values.min() <= colormap_values.max() <= 255
    
    def test_data_validation(self):
        """Test data validation and quality checks."""
        # Test invalid coordinate ranges
        invalid_lons = [-200, 200]  # Outside valid range
        invalid_lats = [-100, 100]  # Outside valid range
        
        # Validation function
        def validate_coordinates(lon, lat):
            return (-180 <= lon <= 180) and (-90 <= lat <= 90)
        
        assert not validate_coordinates(invalid_lons[0], 0)
        assert not validate_coordinates(0, invalid_lats[0])
        assert validate_coordinates(0, 0)  # Valid coordinates
```

## Performance Testing

### Load Testing Suite (`test_performance.py`)
```python
#!/usr/bin/env python3
"""
Performance testing and benchmarking suite.
"""
import pytest
import requests
import time
import concurrent.futures
import statistics
import psutil
import os

class TestPerformance:
    
    @pytest.fixture
    def base_url(self):
        return "http://127.0.0.1:8000"
    
    def test_response_time_benchmarks(self, base_url):
        """Test API response time benchmarks."""
        endpoints = [
            "/health",
            "/",
            "/collections",
            "/test/noaa-dataset"
        ]
        
        response_times = {}
        
        for endpoint in endpoints:
            times = []
            for _ in range(10):  # 10 requests per endpoint
                start_time = time.time()
                response = requests.get(f"{base_url}{endpoint}", timeout=30)
                end_time = time.time()
                
                if response.status_code == 200:
                    times.append(end_time - start_time)
            
            if times:
                response_times[endpoint] = {
                    'mean': statistics.mean(times),
                    'median': statistics.median(times),
                    'max': max(times),
                    'min': min(times)
                }
        
        # Assert performance thresholds
        for endpoint, stats in response_times.items():
            assert stats['mean'] < 5.0, f"{endpoint} too slow: {stats['mean']}s"
            assert stats['max'] < 10.0, f"{endpoint} max time too high: {stats['max']}s"
    
    def test_concurrent_request_handling(self, base_url):
        """Test handling of concurrent requests."""
        def make_request():
            start_time = time.time()
            response = requests.get(f"{base_url}/health", timeout=10)
            end_time = time.time()
            return {
                'status_code': response.status_code,
                'response_time': end_time - start_time
            }
        
        # Test with 20 concurrent requests
        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
            futures = [executor.submit(make_request) for _ in range(50)]
            results = [future.result() for future in futures]
        
        # Analyze results
        success_count = sum(1 for r in results if r['status_code'] == 200)
        response_times = [r['response_time'] for r in results if r['status_code'] == 200]
        
        assert success_count >= 45, f"Too many failed requests: {50 - success_count}"
        
        if response_times:
            mean_time = statistics.mean(response_times)
            assert mean_time < 2.0, f"Mean response time too high under load: {mean_time}s"
    
    def test_memory_usage(self):
        """Test application memory usage."""
        process = psutil.Process(os.getpid())
        
        # Get initial memory usage
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Make several requests to load application
        base_url = "http://127.0.0.1:8000"
        for _ in range(100):
            try:
                requests.get(f"{base_url}/health", timeout=5)
            except:
                pass  # Ignore network errors for this test
        
        # Get memory usage after load
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        memory_increase = final_memory - initial_memory
        
        # Memory should not increase excessively
        assert memory_increase < 100, f"Memory usage increased too much: {memory_increase}MB"
        assert final_memory < 500, f"Total memory usage too high: {final_memory}MB"
    
    def test_database_query_performance(self):
        """Test database query performance."""
        import psycopg
        
        connection_string = os.environ.get("DATABASE_URL")
        if not connection_string:
            pytest.skip("Database not configured")
        
        query_times = []
        
        with psycopg.connect(connection_string) as conn:
            with conn.cursor() as cur:
                # Test multiple queries
                for _ in range(10):
                    start_time = time.time()
                    cur.execute("SELECT COUNT(*) FROM pgstac.collections")
                    cur.fetchone()
                    end_time = time.time()
                    query_times.append(end_time - start_time)
        
        mean_query_time = statistics.mean(query_times)
        max_query_time = max(query_times)
        
        assert mean_query_time < 0.1, f"Database queries too slow: {mean_query_time}s"
        assert max_query_time < 0.5, f"Slowest query too slow: {max_query_time}s"
```

## Integration Testing

### End-to-End Workflow Tests (`test_e2e_workflows.py`)
```python
#!/usr/bin/env python3
"""
End-to-end workflow testing.
"""
import pytest
import requests
import json
import time
from datetime import datetime

class TestEndToEndWorkflows:
    
    @pytest.fixture
    def base_url(self):
        return "http://127.0.0.1:8000"
    
    def test_complete_api_workflow(self, base_url):
        """Test complete API workflow from discovery to data access."""
        # 1. Check service health
        health_response = requests.get(f"{base_url}/health", timeout=10)
        assert health_response.status_code == 200
        assert health_response.json()["status"] in ["healthy", "degraded"]
        
        # 2. Get API information
        root_response = requests.get(base_url, timeout=10)
        assert root_response.status_code == 200
        api_info = root_response.json()
        assert "endpoints" in api_info
        
        # 3. List available collections
        collections_response = requests.get(f"{base_url}/collections", timeout=10)
        assert collections_response.status_code == 200
        
        # 4. Test multidimensional data access
        dataset_response = requests.get(f"{base_url}/test/noaa-dataset", timeout=30)
        assert dataset_response.status_code == 200
        dataset_info = dataset_response.json()
        assert "variables" in dataset_info
        assert len(dataset_info["variables"]) > 0
        
        # 5. Verify API documentation is accessible
        docs_response = requests.get(f"{base_url}/docs", timeout=10)
        assert docs_response.status_code == 200
    
    def test_service_resilience(self, base_url):
        """Test service resilience under various conditions."""
        # Test with invalid parameters
        invalid_requests = [
            f"{base_url}/collections/invalid-collection-id",
            f"{base_url}/tiles/invalid/0/0/0",
            f"{base_url}/md/tiles/0/0/0?variable=nonexistent"
        ]
        
        for url in invalid_requests:
            response = requests.get(url, timeout=10)
            # Should return proper error codes, not crash
            assert response.status_code in [400, 404, 422, 500]
            
            # Should return JSON error response
            try:
                error_data = response.json()
                assert "detail" in error_data or "error" in error_data
            except json.JSONDecodeError:
                # Some endpoints might return plain text errors
                assert len(response.text) > 0
    
    def test_data_pipeline_integrity(self, base_url):
        """Test data pipeline integrity and consistency."""
        # Get dataset information
        dataset_response = requests.get(f"{base_url}/test/noaa-dataset", timeout=30)
        assert dataset_response.status_code == 200
        
        dataset_info = dataset_response.json()
        variables = dataset_info.get("variables", [])
        
        # Verify data consistency
        assert len(variables) > 10, "Expected more weather variables"
        
        # Check for expected weather variables
        expected_vars = ["t2m", "tp", "u10", "v10"]  # temperature, precipitation, wind
        found_vars = [var for var in expected_vars if any(expected in var.lower() for expected in ["temp", "precip", "wind", "t2m", "tp", "u10", "v10"])]
        
        # Should find at least some weather variables
        assert len(found_vars) > 0 or len(variables) > 15, "Expected weather variables not found"
    
    def test_monitoring_endpoints(self, base_url):
        """Test monitoring and observability endpoints."""
        # Health check with detailed information
        health_response = requests.get(f"{base_url}/health", timeout=10)
        assert health_response.status_code == 200
        
        health_data = health_response.json()
        assert "timestamp" in health_data
        assert "services" in health_data
        
        # Verify timestamp is recent (within last minute)
        timestamp_str = health_data["timestamp"]
        timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        now = datetime.now(timestamp.tzinfo)
        time_diff = (now - timestamp).total_seconds()
        assert time_diff < 60, f"Health check timestamp too old: {time_diff}s"
        
        # Test proxy health check if available
        try:
            proxy_response = requests.get(f"{base_url}/health/proxy", timeout=10)
            if proxy_response.status_code == 200:
                proxy_data = proxy_response.json()
                assert "proxy_headers" in proxy_data
        except requests.exceptions.RequestException:
            # Proxy health endpoint might not be available
            pass
```

## Test Execution and Reporting

### Test Runner Configuration (`pytest.ini`)
```ini
[tool:pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = 
    -v 
    --tb=short 
    --strict-markers
    --disable-warnings
    --durations=10
markers =
    unit: Unit tests
    integration: Integration tests
    performance: Performance tests
    e2e: End-to-end tests
    slow: Slow tests (may take >30 seconds)
    database: Tests requiring database connection
    network: Tests requiring network access
```

### Test Execution Script (`run_tests.py`)
```python
#!/usr/bin/env python3
"""
Test execution script with comprehensive reporting.
"""
import subprocess
import sys
import os
import json
import time
from pathlib import Path

def run_test_suite():
    """Run complete test suite with reporting."""
    print("🧪 Starting TiTiler-PgSTAC Test Suite")
    print("=" * 50)
    
    # Test categories to run
    test_categories = [
        ("Unit Tests", "tests/test_gdal_installation.py tests/test_database_connectivity.py"),
        ("Integration Tests", "tests/test_nginx_proxy.py tests/test_api_endpoints.py"),
        ("Performance Tests", "tests/test_performance.py"),
        ("E2E Tests", "tests/test_e2e_workflows.py")
    ]
    
    results = {}
    start_time = time.time()
    
    for category_name, test_path in test_categories:
        print(f"\n📋 Running {category_name}...")
        
        cmd = [
            sys.executable, "-m", "pytest",
            test_path,
            "-v",
            "--tb=short",
            "--json-report",
            f"--json-report-file=test_results_{category_name.lower().replace(' ', '_')}.json"
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            
            results[category_name] = {
                "exit_code": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "success": result.returncode == 0
            }
            
            if result.returncode == 0:
                print(f"✅ {category_name} passed")
            else:
                print(f"❌ {category_name} failed")
                print(f"Error output: {result.stderr}")
                
        except subprocess.TimeoutExpired:
            print(f"⏰ {category_name} timed out")
            results[category_name] = {
                "exit_code": -1,
                "success": False,
                "error": "Test timeout"
            }
    
    total_time = time.time() - start_time
    
    # Generate summary report
    print("\n" + "=" * 50)
    print("📊 TEST SUMMARY")
    print("=" * 50)
    
    passed_categories = sum(1 for r in results.values() if r["success"])
    total_categories = len(results)
    
    print(f"Categories passed: {passed_categories}/{total_categories}")
    print(f"Total execution time: {total_time:.2f}s")
    
    for category, result in results.items():
        status = "✅ PASS" if result["success"] else "❌ FAIL"
        print(f"{category}: {status}")
    
    # Exit with error if any tests failed
    if passed_categories < total_categories:
        print("\n⚠️  Some tests failed. Check the output above for details.")
        sys.exit(1)
    else:
        print("\n🎉 All tests passed!")
        sys.exit(0)

if __name__ == "__main__":
    run_test_suite()
```

This comprehensive testing framework ensures reliable deployment validation and ongoing system health monitoring for the TiTiler-PgSTAC implementation.