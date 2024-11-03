#!/bin/bash
echo "starting noVNC"

# Start noVNC with explicit websocket settings
/opt/noVNC/utils/novnc_proxy \
    --vnc localhost:$PORT_VNC_INTERNAL \
    --listen $PORT_NOVNC_INTERNAL \
    --web /opt/noVNC \
    > /tmp/novnc.log 2>&1 &

# Wait for noVNC to start
timeout=10
while [ $timeout -gt 0 ]; do
    if netstat -tuln | grep -q ":$PORT_NOVNC_INTERNAL "; then
        break
    fi
    sleep 1
    timeout=$((timeout - 1))
done

if [ $timeout -eq 0 ]; then
    echo "Failed to start noVNC" >&2
    exit 1
fi
