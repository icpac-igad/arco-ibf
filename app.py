import os
import logging
from flask import Flask, render_template, jsonify

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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
