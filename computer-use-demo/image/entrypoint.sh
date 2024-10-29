#!/bin/bash
set -e

./start_all.sh
./novnc_startup.sh

python http_server.py > /tmp/server_logs.txt 2>&1 &

# Check if we should start in batch mode
if [ "$RUN_MODE" = "batch" ]; then
    echo "Starting in batch mode..."
    # Use --log-level info to see the detailed logs
    python -m uvicorn computer_use_demo.batch_api:app --host 0.0.0.0 --port 8000 --log-level info 2>&1 | tee /tmp/batch_api.log &
    echo "✨ Computer Use Demo is ready in batch mode!"
    echo "➡️  API endpoints available at http://localhost:8000"
else
    echo "Starting in Streamlit mode..."
    STREAMLIT_SERVER_PORT=8501 python -m streamlit run computer_use_demo/streamlit.py > /tmp/streamlit_stdout.log &
    echo "✨ Computer Use Demo is ready!"
    echo "➡️  Open http://localhost:8080 in your browser to begin"
fi

# Keep the container running
tail -f /dev/null
