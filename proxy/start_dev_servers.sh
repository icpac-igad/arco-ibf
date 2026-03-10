#!/bin/bash
# IBF Dashboard Development Servers Startup Script
# Usage: ./start_dev_servers.sh [start|stop|status|logs]

PROJECT_ROOT="/home/roller/Documents/08-2023/working_notes_jupyter/ignore_nka_gitrepos/ibf-calendar-cmra/codex-svl-mdx-ibf-calendar-storymaps"
PROXY_LOG="$PROJECT_ROOT/proxy.log"
FRONTEND_DIR="$PROJECT_ROOT/svelte-app"

start_servers() {
    echo "🚀 Starting IBF Dashboard Dev Servers..."
    
    # Check if .env exists
    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        echo "❌ Error: .env file not found!"
        echo "Please create .env file with CLOUDRUN_SERVICE_URL and CLOUDRUN_SA_KEY_FILE"
        exit 1
    fi
    
    # Start FastAPI Proxy
    echo "📡 Starting FastAPI proxy on port 8000..."
    cd "$PROJECT_ROOT"
    nohup micromamba run -n zarrv3 uvicorn app:app --host 0.0.0.0 --port 8000 > "$PROXY_LOG" 2>&1 &
    PROXY_PID=$!
    echo "   Proxy PID: $PROXY_PID"
    
    # Wait for proxy to start
    sleep 2
    
    # Check if proxy started successfully
    if curl -s http://localhost:8000/ > /dev/null 2>&1; then
        echo "   ✅ Proxy server running"
    else
        echo "   ❌ Proxy server failed to start. Check $PROXY_LOG"
        exit 1
    fi
    
    # Start Vite Dev Server (in background)
    echo "🎨 Starting Vite dev server on port 5000..."
    cd "$FRONTEND_DIR"
    npm run dev > /dev/null 2>&1 &
    VITE_PID=$!
    echo "   Vite PID: $VITE_PID"
    
    # Wait for vite to start
    sleep 3
    
    # Check if vite started successfully
    if curl -s http://localhost:5000/ > /dev/null 2>&1; then
        echo "   ✅ Vite dev server running"
    else
        echo "   ❌ Vite dev server failed to start"
        exit 1
    fi
    
    echo ""
    echo "✅ Both servers running!"
    echo ""
    echo "📍 Access points:"
    echo "   Frontend: http://localhost:5000"
    echo "   Proxy API: http://localhost:8000"
    echo "   Events Tab: http://localhost:5000/?stage=events&hazard=drought"
    echo ""
    echo "📋 Logs:"
    echo "   Proxy: tail -f $PROXY_LOG"
    echo ""
    echo "🛑 To stop: ./start_dev_servers.sh stop"
}

stop_servers() {
    echo "🛑 Stopping IBF Dashboard Dev Servers..."
    
    # Stop proxy
    pkill -f "uvicorn app:app"
    if [ $? -eq 0 ]; then
        echo "   ✅ Proxy server stopped"
    else
        echo "   ℹ️  No proxy server running"
    fi
    
    # Stop vite
    pkill -f "vite dev"
    if [ $? -eq 0 ]; then
        echo "   ✅ Vite dev server stopped"
    else
        echo "   ℹ️  No vite server running"
    fi
    
    echo "✅ Servers stopped"
}

status_servers() {
    echo "📊 Server Status:"
    echo ""
    
    # Check proxy
    if pgrep -f "uvicorn app:app" > /dev/null; then
        echo "✅ FastAPI Proxy: RUNNING (port 8000)"
        curl -s http://localhost:8000/ | python3 -m json.tool 2>/dev/null | grep -E "status|message"
    else
        echo "❌ FastAPI Proxy: NOT RUNNING"
    fi
    
    echo ""
    
    # Check vite
    if pgrep -f "vite dev" > /dev/null; then
        echo "✅ Vite Dev Server: RUNNING (port 5000)"
    else
        echo "❌ Vite Dev Server: NOT RUNNING"
    fi
}

show_logs() {
    echo "📋 Showing proxy logs (Ctrl+C to exit)..."
    tail -f "$PROXY_LOG"
}

case "${1:-start}" in
    start)
        start_servers
        ;;
    stop)
        stop_servers
        ;;
    status)
        status_servers
        ;;
    logs)
        show_logs
        ;;
    restart)
        stop_servers
        sleep 2
        start_servers
        ;;
    *)
        echo "Usage: $0 {start|stop|status|logs|restart}"
        exit 1
        ;;
esac
