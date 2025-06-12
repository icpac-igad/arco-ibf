"""
STAC Explorer - Core functionality for exploring STAC servers
"""

import json
import logging
from typing import List, Optional, Dict, Any
import requests
import pystac

logger = logging.getLogger(__name__)

class STACExplorer:
    """Core class for exploring STAC (Spatio-Temporal Asset Catalog) servers"""
    
    def __init__(self, api_url: str):
        """
        Initialize STAC Explorer with API URL
        
        Args:
            api_url: Base URL of the STAC API
        """
        self.api_url = api_url.rstrip('/')
        self.session = requests.Session()
        # Set reasonable timeout and retry strategy
        self.session.timeout = 30
        
        # Add headers for better compatibility
        self.session.headers.update({
            'User-Agent': 'STAC-Explorer/1.0',
            'Accept': 'application/json'
        })
        
        logger.info(f"Initialized STAC Explorer for: {self.api_url}")
    
    def check_api_availability(self) -> bool:
        """
        Check if the STAC API is available and responding
        
        Returns:
            bool: True if API is available, False otherwise
        """
        try:
            response = self.session.get(f"{self.api_url}/")
            
            if response.status_code == 200:
                logger.info(f"STAC API is available at {self.api_url}")
                return True
            else:
                logger.warning(f"STAC API returned status code {response.status_code}")
                return False
                
        except requests.exceptions.Timeout:
            logger.error(f"Timeout connecting to STAC API: {self.api_url}")
            return False
        except requests.exceptions.ConnectionError as e:
            logger.error(f"Connection error to STAC API: {e}")
            return False
        except requests.exceptions.RequestException as e:
            logger.error(f"Error connecting to STAC API: {e}")
            return False
    
    def get_api_info(self) -> Optional[Dict[str, Any]]:
        """
        Get STAC API information and capabilities
        
        Returns:
            Dict containing API information or None if failed
        """
        try:
            response = self.session.get(f"{self.api_url}/")
            
            if response.status_code == 200:
                api_info = response.json()
                logger.debug(f"Retrieved API info: {api_info}")
                return api_info
            else:
                logger.warning(f"Failed to get API info, status code: {response.status_code}")
                return None
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Error getting API info: {e}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing API info JSON: {e}")
            return None
    
    def check_collection_exists(self, collection_id: str) -> bool:
        """
        Check if a specific collection exists in the STAC API
        
        Args:
            collection_id: ID of the collection to check
            
        Returns:
            bool: True if collection exists, False otherwise
        """
        try:
            response = self.session.get(f"{self.api_url}/collections/{collection_id}")
            
            if response.status_code == 200:
                logger.info(f"Collection '{collection_id}' exists")
                return True
            elif response.status_code == 404:
                logger.warning(f"Collection '{collection_id}' does not exist")
                return False
            else:
                logger.warning(f"Unexpected status code {response.status_code} when checking collection '{collection_id}'")
                return False
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Error checking collection '{collection_id}': {e}")
            return False
    
    def get_collections(self) -> List[pystac.Collection]:
        """
        Get all collections from the STAC API
        
        Returns:
            List of pystac.Collection objects
        """
        collections = []
        url = f"{self.api_url}/collections"
        
        try:
            while url:
                response = self.session.get(url)
                
                if response.status_code != 200:
                    logger.error(f"Failed to get collections, status code: {response.status_code}")
                    break
                
                data = response.json()
                
                if 'collections' not in data:
                    logger.warning("No 'collections' key found in API response")
                    break
                
                # Process collections from this page
                for col_data in data['collections']:
                    try:
                        collection = pystac.Collection.from_dict(col_data)
                        collections.append(collection)
                        logger.debug(f"Loaded collection: {collection.id}")
                    except Exception as e:
                        logger.warning(f"Failed to parse collection: {e}")
                        continue
                
                # Check for next page
                url = None
                if 'links' in data:
                    for link in data['links']:
                        if link.get('rel') == 'next':
                            url = link.get('href')
                            break
                
                logger.info(f"Retrieved {len(data['collections'])} collections from current page (total so far: {len(collections)})")
            
            logger.info(f"Retrieved {len(collections)} total collections")
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error getting collections: {e}")
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing collections JSON: {e}")
        
        return collections
    
    def get_collection(self, collection_id: str) -> Optional[pystac.Collection]:
        """
        Get a specific collection by ID
        
        Args:
            collection_id: ID of the collection to retrieve
            
        Returns:
            pystac.Collection object or None if not found
        """
        try:
            response = self.session.get(f"{self.api_url}/collections/{collection_id}")
            
            if response.status_code == 200:
                collection_data = response.json()
                collection = pystac.Collection.from_dict(collection_data)
                logger.info(f"Retrieved collection: {collection_id}")
                return collection
            elif response.status_code == 404:
                logger.warning(f"Collection '{collection_id}' not found")
                return None
            else:
                logger.error(f"Failed to get collection '{collection_id}', status code: {response.status_code}")
                return None
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Error getting collection '{collection_id}': {e}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing collection JSON: {e}")
            return None
        except Exception as e:
            logger.error(f"Error creating collection object: {e}")
            return None
    
    def get_items(self, collection_id: str, limit: int = 10, bbox: Optional[List[float]] = None) -> List[pystac.Item]:
        """
        Get items from a specific collection
        
        Args:
            collection_id: ID of the collection
            limit: Maximum number of items to retrieve
            bbox: Optional bounding box filter [west, south, east, north]
            
        Returns:
            List of pystac.Item objects
        """
        items = []
        
        try:
            params = {'limit': limit}
            if bbox:
                params['bbox'] = ','.join(map(str, bbox))
            
            response = self.session.get(
                f"{self.api_url}/collections/{collection_id}/items",
                params=params
            )
            
            if response.status_code != 200:
                logger.error(f"Failed to get items from collection '{collection_id}', status code: {response.status_code}")
                return items
            
            data = response.json()
            
            if 'features' not in data:
                logger.warning(f"No 'features' key found in items response for collection '{collection_id}'")
                return items
            
            for item_data in data['features']:
                try:
                    item = pystac.Item.from_dict(item_data)
                    items.append(item)
                    logger.debug(f"Loaded item: {item.id}")
                except Exception as e:
                    logger.warning(f"Failed to parse item: {e}")
                    continue
            
            logger.info(f"Retrieved {len(items)} items from collection '{collection_id}'")
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error getting items from collection '{collection_id}': {e}")
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing items JSON: {e}")
        
        return items
    
    def get_item(self, collection_id: str, item_id: str) -> Optional[pystac.Item]:
        """
        Get a specific item by ID from a collection
        
        Args:
            collection_id: ID of the collection
            item_id: ID of the item to retrieve
            
        Returns:
            pystac.Item object or None if not found
        """
        try:
            response = self.session.get(f"{self.api_url}/collections/{collection_id}/items/{item_id}")
            
            if response.status_code == 200:
                item_data = response.json()
                item = pystac.Item.from_dict(item_data)
                logger.info(f"Retrieved item: {item_id} from collection: {collection_id}")
                return item
            elif response.status_code == 404:
                logger.warning(f"Item '{item_id}' not found in collection '{collection_id}'")
                return None
            else:
                logger.error(f"Failed to get item '{item_id}', status code: {response.status_code}")
                return None
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Error getting item '{item_id}': {e}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing item JSON: {e}")
            return None
        except Exception as e:
            logger.error(f"Error creating item object: {e}")
            return None
    
    def search_items(self, 
                    collections: Optional[List[str]] = None,
                    bbox: Optional[List[float]] = None,
                    datetime_range: Optional[str] = None,
                    limit: int = 10) -> List[pystac.Item]:
        """
        Search for items across collections using STAC API search endpoint
        
        Args:
            collections: List of collection IDs to search in
            bbox: Bounding box filter [west, south, east, north]
            datetime_range: Datetime range filter (RFC 3339 format)
            limit: Maximum number of items to retrieve
            
        Returns:
            List of pystac.Item objects
        """
        items = []
        
        try:
            # Build search parameters
            search_params = {'limit': limit}
            
            if collections:
                search_params['collections'] = collections
            
            if bbox:
                search_params['bbox'] = bbox
            
            if datetime_range:
                search_params['datetime'] = datetime_range
            
            # Try POST request first (preferred for complex queries)
            try:
                response = self.session.post(
                    f"{self.api_url}/search",
                    json=search_params,
                    headers={'Content-Type': 'application/json'}
                )
            except requests.exceptions.RequestException:
                # Fallback to GET request
                get_params = {}
                if collections:
                    get_params['collections'] = ','.join(collections)
                if bbox:
                    get_params['bbox'] = ','.join(map(str, bbox))
                if datetime_range:
                    get_params['datetime'] = datetime_range
                get_params['limit'] = limit
                
                response = self.session.get(f"{self.api_url}/search", params=get_params)
            
            if response.status_code != 200:
                logger.error(f"Search failed, status code: {response.status_code}")
                return items
            
            data = response.json()
            
            if 'features' not in data:
                logger.warning("No 'features' key found in search response")
                return items
            
            for item_data in data['features']:
                try:
                    item = pystac.Item.from_dict(item_data)
                    items.append(item)
                    logger.debug(f"Found item: {item.id}")
                except Exception as e:
                    logger.warning(f"Failed to parse search result item: {e}")
                    continue
            
            logger.info(f"Search returned {len(items)} items")
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error during search: {e}")
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing search JSON: {e}")
        
        return items
    
    def get_item_assets(self, collection_id: str, item_id: str) -> Dict[str, pystac.Asset]:
        """
        Get assets for a specific item
        
        Args:
            collection_id: ID of the collection
            item_id: ID of the item
            
        Returns:
            Dictionary of asset key to pystac.Asset objects
        """
        item = self.get_item(collection_id, item_id)
        if item and item.assets:
            return item.assets
        return {}
    
    def validate_stac_item(self, item: pystac.Item) -> bool:
        """
        Validate a STAC item using pystac validation
        
        Args:
            item: pystac.Item to validate
            
        Returns:
            bool: True if valid, False otherwise
        """
        try:
            item.validate()
            logger.info(f"Item {item.id} is valid")
            return True
        except Exception as e:
            logger.warning(f"Item {item.id} validation failed: {e}")
            return False
    
    def validate_stac_collection(self, collection: pystac.Collection) -> bool:
        """
        Validate a STAC collection using pystac validation
        
        Args:
            collection: pystac.Collection to validate
            
        Returns:
            bool: True if valid, False otherwise
        """
        try:
            collection.validate()
            logger.info(f"Collection {collection.id} is valid")
            return True
        except Exception as e:
            logger.warning(f"Collection {collection.id} validation failed: {e}")
            return False
