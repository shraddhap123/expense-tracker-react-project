#!/bin/bash

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        ExpenseIQ — Starting Up           ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Check node is available
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Please install from https://nodejs.org"
  exit 1
fi

# Check npm packages are installed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

echo "✅ Starting backend (SQLite API) on port 3001..."
echo "✅ Starting frontend (React/Vite) on port 5173..."
echo ""
echo "👉 Open your browser at: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

npm run dev
