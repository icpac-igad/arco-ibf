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

# API endpoint to check data availability
@app.route('/api/check-data-status')
def check_data_status():
    """Check the availability of data files"""
    data_dir = os.path.join(app.static_folder, 'data')
    
    if not os.path.exists(data_dir):
        logger.warning(f"Data directory {data_dir} does not exist")
        return jsonify({
            'status': 'error',
            'message': 'Data directory not found',
            'data_available': False,
            'path': data_dir
        })
    
    # Check for any .tif files
    has_files = any(f.endswith('.tif') for f in os.listdir(data_dir) if os.path.isfile(os.path.join(data_dir, f)))
    
    if has_files:
        logger.info(f"Data files found in {data_dir}")
        return jsonify({
            'status': 'success',
            'message': 'Data files available',
            'data_available': True
        })
    else:
        logger.warning(f"No data files found in {data_dir}")
        return jsonify({
            'status': 'error',
            'message': 'No data files found',
            'data_available': False
        })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
