#!/bin/bash
echo "starting vnc"

(x11vnc -display $DISPLAY \
    -forever \
    -shared \
    -wait 50 \
    -timeout 60 \
    -noxrecord \
    -noxfixes \
    -noxdamage \
    -rfbport 5900 \
    2>/tmp/x11vnc_stderr.log) &

# Wait for x11vnc to start
timeout=10
while [ $timeout -gt 0 ]; do
    if netstat -tuln | grep -q ":5900 "; then
        break
    fi
    sleep 1
    ((timeout--))
done

if [ $timeout -eq 0 ]; then
    echo "x11vnc stderr output:" >&2
    cat /tmp/x11vnc_stderr.log >&2
    exit 1
fi

rm /tmp/x11vnc_stderr.log
