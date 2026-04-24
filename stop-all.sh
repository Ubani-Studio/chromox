#!/bin/bash

# Chromox - Stop All Services

echo "Stopping Mmuo services..."

# Kill by port
echo "Killing processes on ports..."
lsof -ti:5170 | xargs kill -9 2>/dev/null && echo "  ✓ Frontend stopped (port 5170)"
lsof -ti:5173 | xargs kill -9 2>/dev/null && echo "  ✓ Legacy 5173 listener stopped"
lsof -ti:4414 | xargs kill -9 2>/dev/null && echo "  ✓ Backend stopped (port 4414)"
lsof -ti:5009 | xargs kill -9 2>/dev/null && echo "  ✓ Effects Service stopped (port 5009)"
lsof -ti:5011 | xargs kill -9 2>/dev/null && echo "  ✓ CLAP Service stopped (port 5011)"

# Kill by saved PIDs if available
if [ -f "logs/pids.txt" ]; then
    echo "Killing processes by PID..."
    while read pid; do
        kill -9 $pid 2>/dev/null
    done < logs/pids.txt
    rm logs/pids.txt
fi

echo ""
echo "All services stopped!"
