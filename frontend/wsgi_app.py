#!/usr/bin/env python3
"""
WSGI application for serving the rainfall choropleth visualization HTML file.
Designed to work with Gunicorn for production deployment.
"""

import os
from wsgiref.simple_server import make_server


def application(environ, start_response):
    """WSGI application function."""
    path = environ.get('PATH_INFO', '/')
    method = environ.get('REQUEST_METHOD', 'GET')

    print(f"Request: {method} {path}")  # Debug logging

    # Remove query parameters
    path = path.split('?')[0]

    # Serve the main HTML file for root path
    if path == '/' or path == '/index.html' or path == '':
        html_file = 'river_network_visualization.html'

        try:
            if os.path.exists(html_file):
                with open(html_file, 'r', encoding='utf-8') as f:
                    content = f.read()

                print(f"Serving {html_file} - {len(content)} characters"
                      )  # Debug logging

                status = '200 OK'
                headers = [
                    ('Content-Type', 'text/html; charset=utf-8'),
                    ('Content-Length', str(len(content.encode('utf-8')))),
                    ('Cache-Control', 'no-cache, no-store, must-revalidate'),
                    ('Pragma', 'no-cache'), ('Expires', '0')
                ]
                start_response(status, headers)
                return [content.encode('utf-8')]
            else:
                print(f"File not found: {html_file}")  # Debug logging
                status = '404 Not Found'
                content = f'File not found: {html_file}'
                headers = [('Content-Type', 'text/plain'),
                           ('Content-Length', str(len(content)))]
                start_response(status, headers)
                return [content.encode('utf-8')]
        except Exception as e:
            print(f"Error serving file: {str(e)}")  # Debug logging
            status = '500 Internal Server Error'
            content = f'Server error: {str(e)}'
            headers = [('Content-Type', 'text/plain'),
                       ('Content-Length', str(len(content)))]
            start_response(status, headers)
            return [content.encode('utf-8')]
    else:
        # 404 for other paths
        print(f"Path not found: {path}")  # Debug logging
        status = '404 Not Found'
        content = 'Page not found'
        headers = [('Content-Type', 'text/plain'),
                   ('Content-Length', str(len(content)))]
        start_response(status, headers)
        return [content.encode('utf-8')]


# For testing locally
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    with make_server('0.0.0.0', port, application) as httpd:
        print(f"Serving on http://0.0.0.0:{port}")
        httpd.serve_forever()
