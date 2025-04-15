import os
import logging
import requests
from flask import Flask, render_template, jsonify, Response, request

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Create Flask app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "default_secret_key")

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
    return jsonify({
        'status': 'success',
        'message': 'Cloud-optimized GeoTIFF streaming enabled',
        'source': 'Google Cloud Storage'
    })

# Proxy endpoint for GeoTIFF data
@app.route('/proxy/gcs/<path:file_path>')
def proxy_gcs(file_path):
    """Proxy requests to Google Cloud Storage to overcome CORS issues"""
    gcs_url = f"https://storage.googleapis.com/{file_path}"
    logger.debug(f"Proxying request to GCS: {gcs_url}")
    
    try:
        # Make the request to Google Cloud Storage
        headers = {
            'Range': request.headers.get('Range', ''),
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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
