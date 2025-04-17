import os
import json
import logging
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration paths
CONFIG_DIR = Path(".config")
GCS_CONFIG_FILE = CONFIG_DIR / "gcs_config.json"

def ensure_config_dir():
    """Ensure the config directory exists"""
    if not CONFIG_DIR.exists():
        CONFIG_DIR.mkdir(exist_ok=True)
        logger.info(f"Created configuration directory: {CONFIG_DIR}")
    return CONFIG_DIR

def load_gcs_config():
    """Load GCS configuration from file or environment variables"""
    # First try environment variables
    gcs_credentials = os.environ.get('GCS_CREDENTIALS')
    gcs_bucket = os.environ.get('GCS_BUCKET_NAME')
    gcs_project_id = os.environ.get('GOOGLE_CLOUD_PROJECT')
    
    # If not in environment variables, try config file
    if not gcs_credentials and GCS_CONFIG_FILE.exists():
        try:
            with open(GCS_CONFIG_FILE, 'r') as f:
                config = json.load(f)
                
            gcs_credentials = config.get('credentials')
            gcs_bucket = config.get('bucket', gcs_bucket)
            gcs_project_id = config.get('project_id', gcs_project_id)
            
            # If credentials are loaded from file, set them in environment
            if gcs_credentials:
                # If gcs_credentials is a JSON string, keep it as is
                # If it's a dict, convert to JSON string
                if isinstance(gcs_credentials, dict):
                    os.environ['GCS_CREDENTIALS'] = json.dumps(gcs_credentials)
                else:
                    os.environ['GCS_CREDENTIALS'] = gcs_credentials
                    
                if gcs_bucket:
                    os.environ['GCS_BUCKET_NAME'] = gcs_bucket
                    
                if gcs_project_id:
                    os.environ['GOOGLE_CLOUD_PROJECT'] = gcs_project_id
                    
                logger.info("Loaded GCS credentials from config file")
        except Exception as e:
            logger.error(f"Error loading GCS config: {str(e)}")
    
    return {
        'credentials': gcs_credentials,
        'bucket': gcs_bucket or 'plotpotential-public',
        'project_id': gcs_project_id or 'default-project-id'
    }

def save_gcs_config(credentials, bucket=None, project_id=None):
    """Save GCS configuration to file"""
    ensure_config_dir()
    
    config = {
        'credentials': credentials,
        'bucket': bucket or os.environ.get('GCS_BUCKET_NAME', 'plotpotential-public'),
        'project_id': project_id or os.environ.get('GOOGLE_CLOUD_PROJECT', 'default-project-id')
    }
    
    try:
        with open(GCS_CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
        logger.info(f"Saved GCS configuration to {GCS_CONFIG_FILE}")
        return True
    except Exception as e:
        logger.error(f"Error saving GCS config: {str(e)}")
        return False

# Helper function to determine if a JSON string is valid
def is_valid_json(json_string):
    try:
        if isinstance(json_string, dict):
            return True
        elif isinstance(json_string, str):
            json.loads(json_string)
            return True
    except:
        pass
    return False