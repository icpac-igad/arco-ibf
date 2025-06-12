"""
CLI interface for STAC Explorer
"""

import json
import csv
import logging
from typing import Optional, Dict, Any, List
from tabulate import tabulate
from stac_explorer import STACExplorer
from utils import format_datetime, format_bbox, format_file_size

logger = logging.getLogger(__name__)

class STACExplorerCLI:
    """Command-line interface for STAC Explorer"""
    
    def __init__(self, api_url: str):
        """Initialize CLI with STAC API URL"""
        self.explorer = STACExplorer(api_url)
        self.api_url = api_url
    
    def check_availability(self):
        """Check STAC API availability and display status"""
        print(f"Checking STAC API at: {self.api_url}")
        print("-" * 50)
        
        is_available = self.explorer.check_api_availability()
        
        if is_available:
            # Get API info
            api_info = self.explorer.get_api_info()
            if api_info:
                print(f"✓ API Title: {api_info.get('title', 'N/A')}")
                print(f"✓ API Description: {api_info.get('description', 'N/A')}")
                print(f"✓ STAC Version: {api_info.get('stac_version', 'N/A')}")
                
                conformsTo = api_info.get('conformsTo', [])
                if conformsTo:
                    print(f"✓ Conforms To: {', '.join(conformsTo)}")
            
            print(f"✓ STAC API is available and responsive")
        else:
            print("✗ STAC API is not available or not responding")
    
    def list_collections(self, format_type: str = 'table'):
        """List all collections in the STAC API"""
        print(f"Retrieving collections from: {self.api_url}")
        print("-" * 50)
        
        collections = self.explorer.get_collections()
        
        if not collections:
            print("No collections found or API is not accessible")
            return
        
        if format_type == 'json':
            print(json.dumps([col.to_dict() for col in collections], indent=2))
        elif format_type == 'summary':
            print(f"Found {len(collections)} collection(s):")
            for col in collections:
                print(f"  - {col.id}: {col.title or 'No title'}")
        else:  # table format
            table_data = []
            for col in collections:
                extent = col.extent
                spatial_extent = "N/A"
                temporal_extent = "N/A"
                
                if extent and extent.spatial and extent.spatial.bboxes:
                    spatial_extent = format_bbox(extent.spatial.bboxes[0])
                
                if extent and extent.temporal and extent.temporal.intervals:
                    interval = extent.temporal.intervals[0]
                    if interval[0] and interval[1]:
                        temporal_extent = f"{format_datetime(interval[0])} to {format_datetime(interval[1])}"
                    elif interval[0]:
                        temporal_extent = f"From {format_datetime(interval[0])}"
                
                table_data.append([
                    col.id,
                    col.title or "N/A",
                    spatial_extent,
                    temporal_extent,
                    col.description[:100] + "..." if col.description and len(col.description) > 100 else col.description or "N/A"
                ])
            
            headers = ["ID", "Title", "Spatial Extent", "Temporal Extent", "Description"]
            print(tabulate(table_data, headers=headers, tablefmt="grid", maxcolwidths=[20, 25, 30, 25, 50]))
    
    def browse_items(self, collection_id: str, limit: int = 10, bbox: Optional[List[float]] = None, format_type: str = 'table', output_file: Optional[str] = None):
        """Browse items in a specific collection"""
        bbox_info = ""
        if bbox:
            bbox_info = f" with bbox filter [{bbox[0]}, {bbox[1]}, {bbox[2]}, {bbox[3]}]"
        
        print(f"Retrieving items from collection '{collection_id}'{bbox_info}...")
        print("-" * 50)
        
        if not self.explorer.check_collection_exists(collection_id):
            print(f"Collection '{collection_id}' does not exist")
            return
        
        items = self.explorer.get_items(collection_id, limit=limit, bbox=bbox)
        
        if not items:
            print(f"No items found in collection '{collection_id}'")
            return
        
        if format_type == 'json':
            json_data = json.dumps([item.to_dict() for item in items], indent=2, default=str)
            if output_file:
                try:
                    with open(output_file, 'w') as f:
                        f.write(json_data)
                    print(f"✓ {len(items)} items exported to: {output_file}")
                except Exception as e:
                    print(f"✗ Error writing to file: {e}")
                    print(json_data)  # Fallback to stdout
            else:
                print(json_data)
        elif format_type == 'summary':
            print(f"Found {len(items)} item(s) in collection '{collection_id}':")
            for item in items:
                print(f"  - {item.id}: {item.properties.get('title', 'No title')}")
        else:  # table format
            table_data = []
            for item in items:
                bbox = "N/A"
                if item.bbox:
                    bbox = format_bbox(item.bbox)
                
                datetime_str = "N/A"
                if item.datetime:
                    datetime_str = format_datetime(item.datetime)
                elif item.properties.get('datetime'):
                    datetime_str = item.properties.get('datetime')
                
                # Count assets
                asset_count = len(item.assets) if item.assets else 0
                
                table_data.append([
                    item.id,
                    item.properties.get('title', 'N/A'),
                    datetime_str,
                    bbox,
                    asset_count
                ])
            
            headers = ["ID", "Title", "DateTime", "Bbox", "Assets"]
            print(tabulate(table_data, headers=headers, tablefmt="grid", maxcolwidths=[25, 30, 20, 40, 10]))
    
    def export_metadata(self, collection_id: Optional[str] = None, format_type: str = 'json', output_file: Optional[str] = None):
        """Export collection or item metadata to file"""
        if collection_id:
            print(f"Exporting metadata for collection '{collection_id}'...")
            
            if not self.explorer.check_collection_exists(collection_id):
                print(f"Collection '{collection_id}' does not exist")
                return
            
            # Export collection and its items
            collection = self.explorer.get_collection(collection_id)
            items = self.explorer.get_items(collection_id, limit=1000)  # Get more items for export
            
            data = {
                'collection': collection.to_dict() if collection else None,
                'items': [item.to_dict() for item in items] if items else []
            }
            
            filename = output_file or f"{collection_id}_export.{format_type}"
        else:
            print("Exporting metadata for all collections...")
            collections = self.explorer.get_collections()
            
            data = {
                'collections': [col.to_dict() for col in collections] if collections else []
            }
            
            filename = output_file or f"all_collections_export.{format_type}"
        
        try:
            if format_type == 'json':
                with open(filename, 'w') as f:
                    json.dump(data, f, indent=2, default=str)
            elif format_type == 'csv':
                # For CSV, we'll export a flattened version
                with open(filename, 'w', newline='') as f:
                    if collection_id and 'items' in data:
                        # Export items as CSV
                        if data['items']:
                            writer = csv.DictWriter(f, fieldnames=self._get_csv_fieldnames(data['items']))
                            writer.writeheader()
                            for item in data['items']:
                                writer.writerow(self._flatten_item_dict(item))
                    else:
                        # Export collections as CSV
                        if data['collections']:
                            writer = csv.DictWriter(f, fieldnames=self._get_collection_csv_fieldnames(data['collections']))
                            writer.writeheader()
                            for collection in data['collections']:
                                writer.writerow(self._flatten_collection_dict(collection))
            
            print(f"✓ Metadata exported to: {filename}")
        except Exception as e:
            print(f"✗ Error exporting metadata: {e}")
    
    def get_info(self, collection_id: Optional[str] = None, item_id: Optional[str] = None):
        """Get detailed information about a collection or item"""
        if collection_id and item_id:
            # Get item info
            print(f"Getting information for item '{item_id}' in collection '{collection_id}'...")
            print("-" * 50)
            
            item = self.explorer.get_item(collection_id, item_id)
            if not item:
                print(f"Item '{item_id}' not found in collection '{collection_id}'")
                return
            
            self._display_item_info(item)
            
        elif collection_id:
            # Get collection info
            print(f"Getting information for collection '{collection_id}'...")
            print("-" * 50)
            
            collection = self.explorer.get_collection(collection_id)
            if not collection:
                print(f"Collection '{collection_id}' not found")
                return
            
            self._display_collection_info(collection)
        else:
            print("Please specify either --collection or both --collection and --item")
    
    def _display_collection_info(self, collection):
        """Display detailed collection information"""
        print(f"Collection ID: {collection.id}")
        print(f"Title: {collection.title or 'N/A'}")
        print(f"Description: {collection.description or 'N/A'}")
        
        if collection.extent:
            if collection.extent.spatial and collection.extent.spatial.bboxes:
                bbox = collection.extent.spatial.bboxes[0]
                print(f"Spatial Extent: {format_bbox(bbox)}")
            
            if collection.extent.temporal and collection.extent.temporal.intervals:
                interval = collection.extent.temporal.intervals[0]
                if interval[0] and interval[1]:
                    print(f"Temporal Extent: {format_datetime(interval[0])} to {format_datetime(interval[1])}")
                elif interval[0]:
                    print(f"Temporal Extent: From {format_datetime(interval[0])}")
        
        if collection.license:
            print(f"License: {collection.license}")
        
        if collection.keywords:
            print(f"Keywords: {', '.join(collection.keywords)}")
        
        # Display item count
        items = self.explorer.get_items(collection.id, limit=1)
        if items:
            print("✓ Collection contains items")
        else:
            print("! Collection appears to be empty")
    
    def _display_item_info(self, item):
        """Display detailed item information"""
        print(f"Item ID: {item.id}")
        print(f"Collection: {item.collection_id}")
        
        if item.properties.get('title'):
            print(f"Title: {item.properties['title']}")
        
        if item.datetime:
            print(f"DateTime: {format_datetime(item.datetime)}")
        
        if item.bbox:
            print(f"Bounding Box: {format_bbox(item.bbox)}")
        
        if item.geometry:
            print(f"Geometry Type: {item.geometry.get('type', 'N/A')}")
        
        # Display properties
        if item.properties:
            print("\nProperties:")
            for key, value in item.properties.items():
                if key not in ['title', 'datetime']:
                    print(f"  {key}: {value}")
        
        # Display assets
        if item.assets:
            print(f"\nAssets ({len(item.assets)}):")
            asset_table = []
            for asset_key, asset in item.assets.items():
                asset_table.append([
                    asset_key,
                    asset.title or 'N/A',
                    asset.media_type or 'N/A',
                    asset.href[:60] + '...' if len(asset.href) > 60 else asset.href
                ])
            
            headers = ["Key", "Title", "Media Type", "URL"]
            print(tabulate(asset_table, headers=headers, tablefmt="grid"))
    
    def _get_csv_fieldnames(self, items: List[Dict[Any, Any]]) -> List[str]:
        """Get CSV fieldnames from items"""
        fieldnames = set()
        for item in items[:10]:  # Sample first 10 items
            fieldnames.update(self._flatten_item_dict(item).keys())
        return sorted(list(fieldnames))
    
    def _get_collection_csv_fieldnames(self, collections: List[Dict[Any, Any]]) -> List[str]:
        """Get CSV fieldnames from collections"""
        fieldnames = set()
        for collection in collections:
            fieldnames.update(self._flatten_collection_dict(collection).keys())
        return sorted(list(fieldnames))
    
    def _flatten_item_dict(self, item_dict: Dict[Any, Any]) -> Dict[str, Any]:
        """Flatten item dictionary for CSV export"""
        flattened = {
            'id': item_dict.get('id'),
            'collection': item_dict.get('collection'),
            'datetime': item_dict.get('datetime'),
            'bbox': str(item_dict.get('bbox', [])),
            'geometry_type': item_dict.get('geometry', {}).get('type')
        }
        
        # Add properties
        properties = item_dict.get('properties', {})
        for key, value in properties.items():
            flattened[f'property_{key}'] = value
        
        # Add asset count
        assets = item_dict.get('assets', {})
        flattened['asset_count'] = len(assets)
        
        return flattened
    
    def _flatten_collection_dict(self, collection_dict: Dict[Any, Any]) -> Dict[str, Any]:
        """Flatten collection dictionary for CSV export"""
        flattened = {
            'id': collection_dict.get('id'),
            'title': collection_dict.get('title'),
            'description': collection_dict.get('description'),
            'license': collection_dict.get('license')
        }
        
        # Add extent information
        extent = collection_dict.get('extent', {})
        spatial = extent.get('spatial', {})
        temporal = extent.get('temporal', {})
        
        if spatial.get('bbox'):
            flattened['spatial_bbox'] = str(spatial['bbox'][0] if spatial['bbox'] else [])
        
        if temporal.get('interval'):
            interval = temporal['interval'][0] if temporal['interval'] else []
            flattened['temporal_start'] = interval[0] if len(interval) > 0 else None
            flattened['temporal_end'] = interval[1] if len(interval) > 1 else None
        
        return flattened
