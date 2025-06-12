"""
Utility functions for STAC Explorer
"""

import os
from datetime import datetime
from typing import List, Any, Optional
import dateutil.parser

def format_datetime(dt) -> str:
    """
    Format datetime object or string to readable format
    
    Args:
        dt: datetime object or ISO string
        
    Returns:
        Formatted datetime string
    """
    if dt is None:
        return "N/A"
    
    if isinstance(dt, str):
        try:
            dt = dateutil.parser.parse(dt)
        except (ValueError, TypeError):
            return str(dt)
    
    if isinstance(dt, datetime):
        return dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    
    return str(dt)

def format_bbox(bbox: List[float]) -> str:
    """
    Format bounding box coordinates to readable string
    
    Args:
        bbox: List of [west, south, east, north] coordinates
        
    Returns:
        Formatted bounding box string
    """
    if not bbox or len(bbox) != 4:
        return "N/A"
    
    west, south, east, north = bbox
    return f"W:{west:.4f}, S:{south:.4f}, E:{east:.4f}, N:{north:.4f}"

def format_file_size(size_bytes: int) -> str:
    """
    Format file size in bytes to human readable format
    
    Args:
        size_bytes: Size in bytes
        
    Returns:
        Formatted size string (e.g., "1.5 MB")
    """
    if size_bytes == 0:
        return "0 B"
    
    size_names = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    size = float(size_bytes)
    
    while size >= 1024.0 and i < len(size_names) - 1:
        size /= 1024.0
        i += 1
    
    return f"{size:.1f} {size_names[i]}"

def validate_url(url: str) -> bool:
    """
    Basic URL validation
    
    Args:
        url: URL string to validate
        
    Returns:
        True if URL appears valid
    """
    if not url:
        return False
    
    return url.startswith(('http://', 'https://'))

def get_env_var(key: str, default: Optional[str] = None) -> Optional[str]:
    """
    Get environment variable with optional default
    
    Args:
        key: Environment variable key
        default: Default value if key not found
        
    Returns:
        Environment variable value or default
    """
    return os.getenv(key, default)

def truncate_string(text: str, max_length: int = 100) -> str:
    """
    Truncate string to maximum length with ellipsis
    
    Args:
        text: String to truncate
        max_length: Maximum length before truncation
        
    Returns:
        Truncated string with ellipsis if needed
    """
    if not text:
        return ""
    
    if len(text) <= max_length:
        return text
    
    return text[:max_length-3] + "..."

def safe_get_nested(data: dict, keys: List[str], default: Any = None) -> Any:
    """
    Safely get nested dictionary value
    
    Args:
        data: Dictionary to search
        keys: List of keys for nested access
        default: Default value if key path not found
        
    Returns:
        Value at nested key path or default
    """
    current = data
    
    for key in keys:
        if isinstance(current, dict) and key in current:
            current = current[key]
        else:
            return default
    
    return current

def parse_bbox_string(bbox_str: str) -> Optional[List[float]]:
    """
    Parse bounding box string to list of floats
    
    Args:
        bbox_str: Comma-separated bounding box string "west,south,east,north"
        
    Returns:
        List of [west, south, east, north] floats or None if invalid
    """
    try:
        parts = bbox_str.split(',')
        if len(parts) != 4:
            return None
        
        bbox = [float(part.strip()) for part in parts]
        
        # Basic validation
        west, south, east, north = bbox
        if west >= east or south >= north:
            return None
        
        return bbox
    except (ValueError, AttributeError):
        return None

def is_valid_collection_id(collection_id: str) -> bool:
    """
    Basic validation for collection ID format
    
    Args:
        collection_id: Collection ID to validate
        
    Returns:
        True if ID appears valid
    """
    if not collection_id or not isinstance(collection_id, str):
        return False
    
    # Basic rules: not empty, reasonable length, no whitespace
    return (
        len(collection_id.strip()) > 0 and
        len(collection_id) <= 100 and
        collection_id == collection_id.strip()
    )

def format_coordinates(coords: List[float], precision: int = 4) -> str:
    """
    Format coordinate list to string with specified precision
    
    Args:
        coords: List of coordinate values
        precision: Number of decimal places
        
    Returns:
        Formatted coordinate string
    """
    if not coords:
        return "N/A"
    
    try:
        formatted = [f"{coord:.{precision}f}" for coord in coords]
        return ", ".join(formatted)
    except (TypeError, ValueError):
        return str(coords)

def extract_filename_from_url(url: str) -> str:
    """
    Extract filename from URL
    
    Args:
        url: URL string
        
    Returns:
        Filename portion of URL
    """
    if not url:
        return ""
    
    try:
        # Remove query parameters and fragments
        clean_url = url.split('?')[0].split('#')[0]
        # Get last part of path
        filename = clean_url.split('/')[-1]
        return filename or "unknown"
    except (AttributeError, IndexError):
        return "unknown"

def create_summary_stats(items: List[Any], field_name: str = 'id') -> dict:
    """
    Create summary statistics for a list of items
    
    Args:
        items: List of items to analyze
        field_name: Field name to use for unique counting
        
    Returns:
        Dictionary with summary statistics
    """
    if not items:
        return {'count': 0, 'unique_count': 0}
    
    total_count = len(items)
    
    try:
        unique_values = set()
        for item in items:
            if hasattr(item, field_name):
                unique_values.add(getattr(item, field_name))
            elif isinstance(item, dict) and field_name in item:
                unique_values.add(item[field_name])
        
        unique_count = len(unique_values)
    except (AttributeError, TypeError):
        unique_count = 0
    
    return {
        'count': total_count,
        'unique_count': unique_count
    }
