# The agent worker: Anthropic's desktop image with our worker served on top of
# it, in place of the Streamlit UI.
#
# Build from the repository root, which is the context this expects:
#   docker build -f docker/worker.Dockerfile -t computer-use-worker:local .
#
# BASE_IMAGE can point at a locally built computer-use-demo image instead of the
# published one. The published tag is mutable; pin it to a digest for anything
# that needs reproducible builds.
ARG BASE_IMAGE=ghcr.io/anthropics/anthropic-quickstarts:computer-use-demo-latest
FROM ${BASE_IMAGE}

USER computeruse
WORKDIR /home/computeruse

ENV APP_DIR=/home/computeruse/app

# Dependencies first so the layer survives changes to our source.
COPY --chown=computeruse:computeruse requirements.txt worker-requirements.txt $APP_DIR/
RUN python -m pip install --no-cache-dir -r $APP_DIR/worker-requirements.txt

COPY --chown=computeruse:computeruse shared/ $APP_DIR/shared/
COPY --chown=computeruse:computeruse worker/ $APP_DIR/worker/
COPY --chown=computeruse:computeruse docker/worker-entrypoint.sh /home/computeruse/worker-entrypoint.sh

# /home/computeruse is where the base image puts computer_use_demo, so the
# import seam in worker/upstream.py resolves without any path insertion.
ENV PYTHONPATH=/home/computeruse/app:/home/computeruse
ENV WORKER_PORT=8000

# 8000 worker API, 6080 noVNC, 5900 VNC. The base image's 8080 combined page and
# 8501 Streamlit are not started.
EXPOSE 8000 6080 5900

ENTRYPOINT ["/home/computeruse/worker-entrypoint.sh"]
