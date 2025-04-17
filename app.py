import os
import logging
import requests
import json
import io
from flask import Flask, render_template, jsonify, Response, request
from google.cloud import storage
from google.oauth2 import service_account

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Create Flask app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "default_secret_key")

# GCS credentials configuration
GCS_CREDENTIALS = os.environ.get('GCS_CREDENTIALS')
GCS_BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME', 'plotpotential-public')

# Function to initialize or refresh GCS client
def initialize_gcs_client():
    global storage_client
    global GCS_CREDENTIALS
    global GCS_BUCKET_NAME
    
    # Refresh environment variables in case they were updated
    GCS_CREDENTIALS = os.environ.get('GCS_CREDENTIALS')
    GCS_BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME', 'plotpotential-public')
    GCS_PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT', 'default-project-id')
    
    try:
        if GCS_CREDENTIALS:
            # Parse the credentials JSON string
            try:
                credentials_info = json.loads(GCS_CREDENTIALS)
                credentials = service_account.Credentials.from_service_account_info(credentials_info)
                storage_client = storage.Client(project=GCS_PROJECT_ID, credentials=credentials)
                logger.info("GCS client initialized with provided credentials")
                return True
            except json.JSONDecodeError:
                logger.error("Invalid JSON format in GCS_CREDENTIALS")
                storage_client = None
                return False
        else:
            # Without credentials, we can still access public buckets via direct URLs
            logger.info("No GCS credentials provided, will use public access mode")
            storage_client = None
            return True
    except Exception as e:
        logger.error(f"Failed to initialize GCS client: {str(e)}")
        storage_client = None
        return False

# Initialize GCS client (if credentials are available)
storage_client = None
initialize_gcs_client()

@app.route('/')
def index():
    """Render the main COG Viewer page"""
    logger.debug("Serving the COG Viewer page")
    return render_template('index.html')

# Serve the GeoJSON boundary file
@app.route('/ea_ghcf_simple.json')
def serve_geojson():
    """Serve the boundary GeoJSON data"""
    logger.debug("Serving GeoJSON boundary file")
    return app.send_static_file('ea_ghcf_simple.json')

# We already have a static folder route for this file
@app.route('/static/ea_ghcf_simple.json')
def serve_static_geojson():
    """Serve the boundary GeoJSON data from static folder"""
    logger.debug("Serving GeoJSON boundary file from static folder")
    return app.send_static_file('ea_ghcf_simple.json')

# API endpoint for cloud-optimized GeoTIFF status
@app.route('/api/cog-status')
def cog_status():
    """Provide information about the cloud-optimized GeoTIFF setup"""
    auth_status = "authenticated" if storage_client else "unauthenticated"
    bucket_name = GCS_BUCKET_NAME
    project_id = os.environ.get('GOOGLE_CLOUD_PROJECT', 'Not set')
    
    configuration = {
        'gcs_authenticated': storage_client is not None,
        'bucket_name': bucket_name,
        'project_id': project_id,
        'has_credentials': GCS_CREDENTIALS is not None,
        'proxy_enabled': True,
        'gcs_api_server': 'storage.googleapis.com'
    }
    
    return jsonify({
        'status': 'success',
        'message': 'Cloud-optimized GeoTIFF streaming enabled',
        'source': 'Google Cloud Storage',
        'auth_status': auth_status,
        'bucket': bucket_name,
        'access_mode': 'authenticated' if storage_client else 'public',
        'configuration': configuration
    })

# Proxy endpoint for GeoTIFF data
@app.route('/proxy/gcs/<path:file_path>')
def proxy_gcs(file_path):
    """Proxy requests to Google Cloud Storage with authentication"""
    try:
        # Parse the file path to get bucket name and object name
        # Default to using the configured bucket if only object path is provided
        if '/' in file_path:
            parts = file_path.split('/', 1)
            if len(parts) == 2:
                bucket_name, blob_name = parts
            else:
                bucket_name = GCS_BUCKET_NAME
                blob_name = file_path
        else:
            bucket_name = GCS_BUCKET_NAME
            blob_name = file_path
            
        logger.debug(f"Proxying authenticated request to GCS bucket: {bucket_name}, blob: {blob_name}")
        
        # Prepare response headers
        response_headers = {
            'Content-Type': 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Range, If-None-Match, If-Modified-Since'
        }
        
        # Check if Range header is present for partial content requests
        range_header = request.headers.get('Range')
        
        if storage_client:
            # Get authenticated access using the GCS client
            bucket = storage_client.bucket(bucket_name)
            blob = bucket.blob(blob_name)
            
            # Download the blob content
            if range_header and range_header.startswith('bytes='):
                # Parse range header (e.g. 'bytes=0-1023')
                range_str = range_header.split('=')[1]
                start, end = map(int, range_str.split('-'))
                end = end + 1  # Make end inclusive
                
                # Create a file-like object to hold the content
                content = io.BytesIO()
                blob.download_to_file(content, start=start, end=end)
                content.seek(0)
                
                # Set content range header
                content_length = end - start
                response_headers['Content-Range'] = f'bytes {start}-{end-1}/{blob.size}'
                response_headers['Content-Length'] = str(content_length)
                status_code = 206  # Partial content
            else:
                # Download the full blob
                content = io.BytesIO()
                blob.download_to_file(content)
                content.seek(0)
                status_code = 200
                response_headers['Content-Length'] = str(blob.size)
            
            # Create the response
            return Response(
                content,
                status=status_code,
                headers=response_headers
            )
        else:
            # Fallback to direct request if GCS client is not available
            # This works for public buckets only
            logger.warning("GCS client not available, falling back to direct request (public buckets only)")
            gcs_url = f"https://storage.googleapis.com/{bucket_name}/{blob_name}"
            
            # Make the request to Google Cloud Storage
            headers = {
                'Range': range_header or '',
                'If-None-Match': request.headers.get('If-None-Match', ''),
                'If-Modified-Since': request.headers.get('If-Modified-Since', '')
            }
            
            # Remove empty headers
            headers = {k: v for k, v in headers.items() if v}
            
            r = requests.get(gcs_url, headers=headers, stream=True)
            
            # Create a Flask response with the same content
            response = Response(
                r.iter_content(chunk_size=1024),
                status=r.status_code
            )
            
            # Copy headers from the GCS response
            for key, value in r.headers.items():
                if key.lower() not in ('transfer-encoding', 'content-encoding', 'content-length'):
                    response.headers[key] = value
                    
            # Add CORS headers
            response.headers['Access-Control-Allow-Origin'] = '*'
            response.headers['Access-Control-Allow-Headers'] = 'Range, If-None-Match, If-Modified-Since'
            
            return response
            
    except Exception as e:
        logger.error(f"Error proxying to GCS: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f"Failed to proxy request: {str(e)}"
        }), 500

# API endpoint to refresh GCS credentials
@app.route('/api/refresh-credentials', methods=['POST'])
def refresh_credentials():
    """Refresh GCS credentials from environment variables"""
    result = initialize_gcs_client()
    
    if result:
        return jsonify({
            'status': 'success',
            'message': 'GCS credentials refreshed successfully',
            'authenticated': True
        })
    else:
        return jsonify({
            'status': 'error',
            'message': 'Failed to refresh GCS credentials. Check logs for details.',
            'authenticated': False
        }), 500

# API endpoint to set GCS credentials
@app.route('/api/set-credentials', methods=['POST'])
def set_credentials():
    """Set GCS credentials from request body"""
    try:
        data = request.get_json()
        
        if not data or not isinstance(data, dict):
            return jsonify({
                'status': 'error',
                'message': 'Invalid request format. Expected JSON object.',
                'authenticated': False
            }), 400
        
        # Get credentials, bucket name, and project ID from request
        credentials_json = data.get('credentials')
        bucket_name = data.get('bucket')
        project_id = data.get('project_id')
        
        if not credentials_json:
            return jsonify({
                'status': 'error',
                'message': 'Missing required field: credentials',
                'authenticated': False
            }), 400
        
        # Set the environment variables
        os.environ['GCS_CREDENTIALS'] = json.dumps(credentials_json)
        if bucket_name:
            os.environ['GCS_BUCKET_NAME'] = bucket_name
        if project_id:
            os.environ['GOOGLE_CLOUD_PROJECT'] = project_id
        
        # Initialize the client with new credentials
        result = initialize_gcs_client()
        
        if result:
            return jsonify({
                'status': 'success',
                'message': 'GCS credentials set and client initialized successfully',
                'authenticated': True,
                'bucket': GCS_BUCKET_NAME
            })
        else:
            return jsonify({
                'status': 'error',
                'message': 'Credentials were set but client initialization failed',
                'authenticated': False
            }), 500
    except Exception as e:
        logger.error(f"Error setting GCS credentials: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f"Failed to set GCS credentials: {str(e)}",
            'authenticated': False
        }), 500

# API endpoint to test GCS authentication
@app.route('/api/test-gcs-auth')
def test_gcs_auth():
    """Test GCS authentication and list available files"""
    if not storage_client:
        return jsonify({
            'status': 'error',
            'message': 'GCS client not initialized. Missing or invalid credentials.',
            'authenticated': False
        }), 400
    
    try:
        bucket_name = GCS_BUCKET_NAME
        prefix = request.args.get('prefix', 'dev/')
        limit = int(request.args.get('limit', '10'))
        
        bucket = storage_client.bucket(bucket_name)
        blobs = list(bucket.list_blobs(prefix=prefix, max_results=limit))
        
        files = [
            {
                'name': blob.name,
                'size': blob.size,
                'updated': blob.updated.isoformat() if blob.updated else None,
                'content_type': blob.content_type
            }
            for blob in blobs
        ]
        
        return jsonify({
            'status': 'success',
            'message': f'Successfully authenticated with GCS. Found {len(files)} files.',
            'authenticated': True,
            'bucket': bucket_name,
            'files': files
        })
    except Exception as e:
        logger.error(f"Error testing GCS authentication: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f"Failed to authenticate with GCS: {str(e)}",
            'authenticated': False
        }), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
