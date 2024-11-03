#!/bin/bash
echo "starting vnc $PORT_VNC_INTERNAL"

(x11vnc -display $DISPLAY \
    -forever \
    -shared \
    -wait 50 \
    -rfbport "$PORT_VNC_INTERNAL" \
    -nopw \
    2>/tmp/x11vnc_stderr.log) &

x11vnc_pid=$!

# Wait for x11vnc to start
timeout=10
while [ $timeout -gt 0 ]; do
    if netstat -tuln | grep -q ":$PORT_VNC_INTERNAL "; then
        break
    fi
    sleep 1
    timeout=$((timeout - 1))
done

if [ $timeout -eq 0 ]; then
    echo "Failed to start x11vnc" >&2
    exit 1
fi
