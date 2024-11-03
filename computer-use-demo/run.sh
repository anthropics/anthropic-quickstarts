#!/bin/bash
set -e

# Directory containing this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Source port configuration
source .ports || {
    echo "Error: Failed to load port configuration from .ports" >&2
    exit 1
}

# Function to check if a port is available
check_port() {
    local port=$1
    if netstat -tuln | grep -q ":${port} "; then
        echo "Error: Port ${port} is already in use" >&2
        return 1
    fi
    return 0
}

# Check all external ports
echo "Checking port availability..."
for port in $PORT_VNC_EXTERNAL $PORT_NOVNC_EXTERNAL $PORT_HTTP_EXTERNAL $PORT_STREAMLIT_EXTERNAL; do
    check_port $port || exit 1
done
echo "All ports are available."

IMAGE_NAME=""
CONTAINER_NAME=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --image)
            IMAGE_NAME="$2"
            shift 2
            ;;
        --container)
            CONTAINER_NAME="$2"
            shift 2
            ;;
        *)
            echo "Usage: $0 --image NAME --container NAME"
            exit 1
            ;;
    esac
done

# Verify required arguments
if [ -z "$IMAGE_NAME" ] || [ -z "$CONTAINER_NAME" ]; then
    echo "Error: --image NAME and --container NAME are required"
    echo "Usage: $0 --image NAME --container NAME"
    exit 1
fi

# Change to script directory and source .env
cd "$(dirname "$0")"
if [ ! -f .env ]; then
    echo "Error: .env file not found"
    exit 1
fi
source .env

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "Error: ANTHROPIC_API_KEY not set in .env"
    exit 1
fi

# Helper functions for ID formatting
short_id() {
    echo "$1" | cut -c1-4
}

container_name() {
    local id=$1
    local name=$2
    echo "$name ($(short_id $id)..)"
}

# Function to check if container is running
container_is_running() {
    docker inspect -f '{{.State.Running}}' "$CONTAINER_ID" 2>/dev/null | grep -q true
    return $?
}

# Remove existing container if it exists
if docker ps -a --format '{{.Names}}' | grep -q "^$CONTAINER_NAME$"; then
    echo "Removing existing $CONTAINER_NAME container..."
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1
fi

# Start container and get container ID
CONTAINER_ID=$(docker run -d \
    -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
    -v "$(pwd)":/host \
    -p ${PORT_VNC_EXTERNAL}:${PORT_VNC_INTERNAL} \
    -p ${PORT_STREAMLIT_EXTERNAL}:${PORT_STREAMLIT_INTERNAL} \
    -p ${PORT_NOVNC_EXTERNAL}:${PORT_NOVNC_INTERNAL} \
    -p ${PORT_HTTP_EXTERNAL}:${PORT_HTTP_INTERNAL} \
    --name "$CONTAINER_NAME" \
    -it "$IMAGE_NAME")

if [ -z "$CONTAINER_ID" ]; then
    echo "Error: Failed to start container."
    exit 1
fi

# Get image ID for nice display
IMAGE_ID=$(docker inspect --format='{{.Id}}' "$IMAGE_NAME" 2>/dev/null | sed 's/sha256://')

echo "Container $(container_name "$CONTAINER_ID" "$CONTAINER_NAME") started from image $IMAGE_NAME ($(short_id "$IMAGE_ID")..)"

# Wait until the container is fully running
echo "Waiting for container to reach running state..."
until container_is_running; do
    sleep 1
done
echo "Container is now running."

# Start log streaming in background
docker logs -f "$CONTAINER_ID" &
LOG_PID=$!

# Initialize signal handling
SIGNAL_RECEIVED=0
CLEANUP_DONE=0

# Cleanup function
cleanup() {
    if [ "$CLEANUP_DONE" -eq 1 ]; then
        return
    fi
    CLEANUP_DONE=1

    echo -e "\nShutting down..."
    echo "Stopping container $(container_name "$CONTAINER_ID" "$CONTAINER_NAME")..."
    result=$(docker stop "$CONTAINER_ID" 2>&1)
    if [ "$result" = "$CONTAINER_ID" ]; then
        echo "✅ Stopped"
    else
        echo "⚠️  Unexpected output: $result"
    fi

    echo "Cleaning up background processes..."
    kill $LOG_PID 2>/dev/null

    echo "Shutdown complete."
}
trap 'SIGNAL_RECEIVED=1; cleanup' EXIT INT TERM

echo "Container started. Access points:"
echo "- Combined interface: http://localhost:${PORT_HTTP_EXTERNAL}"
echo "- Streamlit interface: http://localhost:${PORT_STREAMLIT_EXTERNAL}"
echo "- Desktop view: http://localhost:${PORT_NOVNC_EXTERNAL}/vnc.html"
echo "- Direct VNC: vnc://localhost:${PORT_VNC_EXTERNAL}"

# Monitor loop
while container_is_running; do
    sleep 1
done

# Only show error if we didn't receive SIGINT/SIGTERM
if [ "${SIGNAL_RECEIVED:-0}" != "1" ]; then
    echo "Container stopped unexpectedly."
    exit 1
fi
