#!/usr/bin/env python3
"""
STAC Explorer CLI Tool
A Python CLI tool for testing and exploring STAC (Spatio-Temporal Asset Catalog) server connectivity and data
"""

import argparse
import logging
import sys
import os
from dotenv import load_dotenv
from cli import STACExplorerCLI

# Load environment variables from .env file
load_dotenv()

def setup_logging(verbose=False):
    """Setup logging configuration"""
    # Get log level from environment or use default
    env_log_level = os.getenv('LOG_LEVEL', 'INFO').upper()
    level = logging.DEBUG if verbose else getattr(logging, env_log_level, logging.INFO)
    
    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

def main():
    """Main entry point for the STAC Explorer CLI"""
    parser = argparse.ArgumentParser(
        description='STAC Explorer - Test and explore STAC server connectivity and data',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s check
  %(prog)s collections
  %(prog)s items --collection my-collection
  %(prog)s export --collection my-collection --format json
  %(prog)s items --collection emdat-events --limit 500 --bbox "22,-12,52,23"
        """
    )
    
    # Get URL from environment variable (required)
    default_url = os.getenv('STAC_API_URL')
    if not default_url:
        print("ERROR: STAC_API_URL environment variable not set.")
        print("Please copy .env.example to .env and configure your STAC API URL")
        sys.exit(1)
    
    parser.add_argument(
        '--url', 
        default=default_url,
        help='STAC API URL (loaded from STAC_API_URL environment variable)'
    )
    
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Enable verbose logging'
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Check command
    check_parser = subparsers.add_parser('check', help='Check STAC API availability')
    
    # Collections command
    collections_parser = subparsers.add_parser('collections', help='List collections')
    collections_parser.add_argument(
        '--format',
        choices=['table', 'json', 'summary'],
        default='table',
        help='Output format (default: table)'
    )
    
    # Items command
    items_parser = subparsers.add_parser('items', help='Browse items in a collection')
    items_parser.add_argument('--collection', required=True, help='Collection ID')
    items_parser.add_argument('--limit', type=int, default=10, help='Maximum number of items to retrieve')
    items_parser.add_argument(
        '--bbox', 
        help='Bounding box filter as "west,south,east,north" (e.g., "22,-12,52,23" for East Africa)'
    )
    items_parser.add_argument(
        '--format',
        choices=['table', 'json', 'summary'],
        default='table',
        help='Output format (default: table)'
    )
    items_parser.add_argument('--output', help='Output file path (for json format)')
    
    # Export command
    export_parser = subparsers.add_parser('export', help='Export collection metadata')
    export_parser.add_argument('--collection', help='Collection ID (if not provided, exports all collections)')
    export_parser.add_argument(
        '--format',
        choices=['json', 'csv'],
        default='json',
        help='Export format (default: json)'
    )
    export_parser.add_argument('--output', help='Output file path')
    
    # Info command
    info_parser = subparsers.add_parser('info', help='Get detailed information about a collection or item')
    info_parser.add_argument('--collection', help='Collection ID')
    info_parser.add_argument('--item', help='Item ID')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    setup_logging(args.verbose)
    
    cli = STACExplorerCLI(args.url)
    
    try:
        if args.command == 'check':
            cli.check_availability()
        elif args.command == 'collections':
            cli.list_collections(format_type=args.format)
        elif args.command == 'items':
            bbox = None
            if args.bbox:
                try:
                    bbox = [float(x.strip()) for x in args.bbox.split(',')]
                    if len(bbox) != 4:
                        raise ValueError("Bbox must have exactly 4 values")
                except ValueError as e:
                    print(f"Error parsing bbox: {e}")
                    print("Bbox format: west,south,east,north (e.g., '22,-12,52,23')")
                    sys.exit(1)
            cli.browse_items(args.collection, limit=args.limit, bbox=bbox, format_type=args.format, output_file=getattr(args, 'output', None))
        elif args.command == 'export':
            cli.export_metadata(
                collection_id=args.collection,
                format_type=args.format,
                output_file=args.output
            )
        elif args.command == 'info':
            cli.get_info(collection_id=args.collection, item_id=args.item)
    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
        sys.exit(1)
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
