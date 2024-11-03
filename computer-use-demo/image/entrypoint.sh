#!/bin/bash
set -e

# Source and export all variables from .ports
set -a
source /host/.ports || exit 1
set +a

./start_all.sh
./novnc_startup.sh

# Generate index.html from template
envsubst < static_content/index.html.template > static_content/index.html

python http_server.py > /tmp/server_logs.txt 2>&1 &
STREAMLIT_SERVER_PORT=$PORT_STREAMLIT_INTERNAL python -m streamlit run computer_use_demo/streamlit.py > /tmp/streamlit_stdout.log &

echo "✨ Computer Use Demo is ready!"
echo "➡️  Open http://localhost:$PORT_HTTP_EXTERNAL in your browser to begin"

# Keep the container running
tail -f /dev/null
