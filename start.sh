#!/bin/bash

# Health Metrics Local Extractor - Start Script
# This script starts both the backend and frontend servers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Starting Health Metrics Local Extractor..."
echo ""

# Start backend
echo "📦 Starting Backend (FastAPI)..."
cd "$SCRIPT_DIR/backend"

# Check if venv or .venv exists
if [ ! -d ".venv" ] && [ ! -d "venv" ]; then
    echo "⚠️  Virtual environment not found. Creating one with uv..."
    uv venv
    source .venv/bin/activate
    uv pip install -r requirements.txt
elif [ -d ".venv" ]; then
    source .venv/bin/activate
else
    source venv/bin/activate
fi

# Start backend in background
python main.py &
BACKEND_PID=$!
echo "✅ Backend started (PID: $BACKEND_PID)"

# Wait for backend to be ready
echo "⏳ Waiting for backend to start..."
sleep 3

# Start frontend
echo ""
echo "🎨 Starting Frontend (Vite)..."
cd "$SCRIPT_DIR/frontend"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "⚠️  node_modules not found. Installing dependencies..."
    npm install
fi

# Start frontend in background
npm run dev -- --host &
FRONTEND_PID=$!
echo "✅ Frontend started (PID: $FRONTEND_PID)"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  🏥 Health Metrics Local Extractor is running!"
echo ""
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo ""
echo "  Press Ctrl+C to stop both servers"
echo "═══════════════════════════════════════════════════════════"

# Trap Ctrl+C to kill both processes
cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "✅ All servers stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for both processes
wait
