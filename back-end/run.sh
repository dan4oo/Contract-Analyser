#!/bin/bash
# Run the Contract Analyzer backend locally

cd "$(dirname "$0")"

# Activate virtual environment if it exists, otherwise create it
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Installing/updating dependencies..."
./venv/bin/pip install -r requirements.txt

echo "Starting FastAPI server..."
./venv/bin/uvicorn api:app --reload --host 0.0.0.0 --port 8000
