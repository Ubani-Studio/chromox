#!/bin/bash

# Chromox - Start All Services
# Run this from the chromox root directory

echo "Starting Mmuo services..."

# Kill any existing processes on these ports. Frontend moved from 5173
# to 5170 to clear Slayt's dev server - both kills below so an old
# 5173 listener left over from a pre-rename dev session gets cleaned up.
echo "Cleaning up old processes..."
lsof -ti:5170 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null  # legacy, pre-rename port
lsof -ti:4414 | xargs kill -9 2>/dev/null
lsof -ti:5009 | xargs kill -9 2>/dev/null
lsof -ti:5011 | xargs kill -9 2>/dev/null

# Create logs directory
mkdir -p logs

# Start Backend (Node.js)
echo "Starting Backend (port 4414)..."
cd backend
npm run dev > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"
cd ..

# Start Effects Service (Python FastAPI)
echo "Starting Effects Service (port 5009)..."
cd backend/effects_service
source .venv/bin/activate
uvicorn server:app --port 5009 --reload > ../../logs/effects.log 2>&1 &
EFFECTS_PID=$!
echo "Effects Service PID: $EFFECTS_PID"
deactivate
cd ../..

# Start CLAP Service (Python FastAPI)
echo "Starting CLAP Service (port 5011)..."
cd backend/clap_service
source .venv/bin/activate
uvicorn server:app --port 5011 --reload > ../../logs/clap.log 2>&1 &
CLAP_PID=$!
echo "CLAP Service PID: $CLAP_PID"
deactivate
cd ../..

# Wait for services to start
echo "Waiting for services to start..."
sleep 3

# Start Frontend (Vite)
echo "Starting Frontend (port 5170)..."
npx vite --port 5170 --host > logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

# Save PIDs to file for easy stopping
echo $BACKEND_PID > logs/pids.txt
echo $EFFECTS_PID >> logs/pids.txt
echo $CLAP_PID >> logs/pids.txt
echo $FRONTEND_PID >> logs/pids.txt

echo ""
echo "All services started!"
echo ""
echo "Service Status:"
echo "  Frontend:  http://localhost:5170"
echo "  Backend:   http://localhost:4414"
echo "  Effects:   http://localhost:5009"
echo "  CLAP:      http://localhost:5011"
echo ""
echo "Logs are in: ./logs/"
echo "  - backend.log"
echo "  - effects.log"
echo "  - clap.log"
echo "  - frontend.log"
echo ""
echo "To stop all services, run: ./stop-all.sh"
echo ""
