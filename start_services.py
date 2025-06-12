#!/usr/bin/env python3
"""
Service launcher for Nginx + TiTiler on Replit.
Handles both development and production modes.
"""

import os
import sys
import subprocess
import time
import signal
import logging
import shutil
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('launcher')

# Global process list
processes = []


def cleanup(signum=None, frame=None):
    """Clean up all processes on exit."""
    logger.info("Shutting down services...")
    for name, proc in processes:
        if proc and proc.poll() is None:
            logger.info(f"Stopping {name}...")
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
    sys.exit(0)


def setup_nginx_directories():
    """Create necessary directories for Nginx."""
    dirs = [
        '/tmp/nginx_client_temp', '/tmp/nginx_proxy_temp',
        '/tmp/nginx_fastcgi_temp', '/tmp/nginx_uwsgi_temp',
        '/tmp/nginx_scgi_temp'
    ]
    for dir_path in dirs:
        os.makedirs(dir_path, exist_ok=True)
        os.chmod(dir_path, 0o777)  # Ensure Nginx can write


def check_nginx_config():
    """Validate Nginx configuration."""
    logger.info("Checking Nginx configuration...")
    try:
        # Set temp error log for testing
        result = subprocess.run([
            'nginx', '-t', '-c',
            os.path.abspath('nginx.conf'), '-e', '/tmp/nginx_test_error.log'
        ],
                                capture_output=True,
                                text=True)
        if result.returncode != 0:
            logger.error(f"Nginx config test failed: {result.stderr}")
            return False
        logger.info("Nginx configuration is valid")
        return True
    except Exception as e:
        logger.error(f"Failed to test Nginx config: {e}")
        return False


def start_titiler(mode='production'):
    """Start TiTiler backend."""
    logger.info(f"Starting TiTiler in {mode} mode...")

    env = os.environ.copy()
    # Set FORWARDED_ALLOW_IPS to trust Nginx proxy headers
    env['FORWARDED_ALLOW_IPS'] = '127.0.0.1'  # Only trust local Nginx
    original_dir = os.getcwd()
    nginx_conf_path = os.path.join(original_dir, 'nginx.conf')
    ## Check for custom TiTiler in the correct location
    custom_path = 'titiler-pgstac/titiler/pgstac/main.py'
    if os.path.exists(custom_path):
        # Use correct Python module format
        #app_module = 'titiler.pgstac.main:app'
        # Change working directory to where main.py is
        os.chdir('titiler-pgstac/titiler/pgstac')
        app_module = 'main:app'
        logger.info(f"Changed directory to: {os.getcwd()}")
    else:
        app_module = f'{custom_path}:app'
        logger.info("Using default titiler.pgstac.main")

    # Debug: Print which file we're actually loading
    logger.info(f"Current working directory: {os.getcwd()}")
    logger.info(f"Python path: {sys.path}")
    logger.info(f"Checking for custom main.py at: {custom_path}")
    logger.info(f"File exists: {os.path.exists('main.py')}")

    # Also try importing to verify
    try:
        if os.path.exists('main.py'):
            sys.path.insert(0, 'titiler-pgstac')
            import titiler.pgstac.main
            logger.info(f"Successfully imported custom module")
            # Check if your custom endpoint exists
            if hasattr(titiler.pgstac.main.app, 'routes'):
                for route in titiler.pgstac.main.app.routes:
                    if hasattr(route, 'path') and route.path == '/status':
                        logger.info("Found /status endpoint in custom main.py")
    except Exception as e:
        logger.error(f"Failed to import custom module: {e}")

    if mode == 'development':
        cmd = [
            'uvicorn',
            app_module,
            '--host',
            '127.0.0.1',  # Only listen locally
            '--port',
            '8000',
            '--reload',
            '--forwarded-allow-ips',
            '127.0.0.1'
        ]
    else:
        cmd = [
            'gunicorn', app_module, '-k', 'uvicorn.workers.UvicornWorker',
            '--bind', '127.0.0.1:8000', '--workers', '1',
            '--forwarded-allow-ips', '127.0.0.1'
        ]

    try:
        proc = subprocess.Popen(cmd,
                                env=env,
                                stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT,
                                text=True,
                                bufsize=1)

        # Log TiTiler output in a separate thread
        import threading

        def log_output():
            for line in iter(proc.stdout.readline, ''):
                if line:
                    logger.info(f"[TiTiler] {line.strip()}")

        threading.Thread(target=log_output, daemon=True).start()
        return proc, nginx_conf_path
    except Exception as e:
        logger.error(f"Failed to start TiTiler: {e}")
        return None


def start_nginx(nginx_conf_path):
    """Start Nginx."""
    logger.info("Starting Nginx...")

    # Use absolute path to nginx.conf from root
    # nginx_conf_path = os.path.join(
    #     os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    #     'nginx.conf'
    # )

    # Or simpler: store original directory
    # At the top of start_titiler(), add:
    #original_dir = os.getcwd()
    # Then use: nginx_conf_path = os.path.join(original_dir, 'nginx.conf')

    if not os.path.exists(nginx_conf_path):
        logger.error(f"nginx.conf not found at {nginx_conf_path}")
        return None

    cmd = [
        'nginx',
        '-c',
        nginx_conf_path,
        #os.path.abspath('nginx.conf'),
        '-g',
        'daemon off;'  # Run in foreground
    ]

    try:
        proc = subprocess.Popen(cmd,
                                stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT,
                                text=True,
                                bufsize=1)

        # Log Nginx output
        import threading

        def log_output():
            for line in iter(proc.stdout.readline, ''):
                if line:
                    logger.info(f"[Nginx] {line.strip()}")

        threading.Thread(target=log_output, daemon=True).start()
        return proc
    except Exception as e:
        logger.error(f"Failed to start Nginx: {e}")
        return None


def wait_for_service(host, port, timeout=30):
    """Wait for a service to become available."""
    import socket
    logger.info(f"Waiting for {host}:{port} to become available...")

    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex((host, port))
            sock.close()
            if result == 0:
                logger.info(f"Service on {host}:{port} is ready")
                return True
        except:
            pass
        time.sleep(1)

    logger.error(f"Timeout waiting for {host}:{port}")
    return False


def main():
    """Main entry point."""
    mode = sys.argv[1] if len(sys.argv) > 1 else 'production'
    logger.info(f"Starting services in {mode} mode...")

    # Set up signal handlers
    signal.signal(signal.SIGTERM, cleanup)
    signal.signal(signal.SIGINT, cleanup)

    # Setup directories
    setup_nginx_directories()

    # Check Nginx config
    if not check_nginx_config():
        logger.error("Nginx configuration is invalid. Please fix nginx.conf")
        sys.exit(1)

    # Start TiTiler
    titiler_proc, nginx_conf_path = start_titiler(mode)
    if not titiler_proc:
        logger.error("Failed to start TiTiler")
        sys.exit(1)
    processes.append(('TiTiler', titiler_proc))

    # Wait for TiTiler to be ready
    if not wait_for_service('127.0.0.1', 8000):
        logger.error("TiTiler failed to start")
        cleanup()

    # Start Nginx
    nginx_proc = start_nginx(nginx_conf_path)
    if not nginx_proc:
        logger.error("Failed to start Nginx")
        cleanup()
    processes.append(('Nginx', nginx_proc))

    # Wait for Nginx to be ready
    if not wait_for_service('0.0.0.0', 5000):
        logger.error("Nginx failed to start")
        cleanup()

    logger.info("=" * 50)
    logger.info("All services started successfully!")
    logger.info(f"TiTiler (internal): http://127.0.0.1:8000")
    logger.info(f"Nginx (public): http://0.0.0.0:5000")
    logger.info("=" * 50)

    # Monitor processes
    try:
        while True:
            for name, proc in processes:
                if proc.poll() is not None:
                    logger.error(f"{name} process died unexpectedly!")
                    cleanup()
            time.sleep(5)
    except KeyboardInterrupt:
        cleanup()


if __name__ == '__main__':
    main()
