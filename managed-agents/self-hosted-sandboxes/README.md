# Self-hosted sandboxes with Docker

Two demos of running managed-agent sessions on hardware you control, with
plain Docker as the per-session sandbox. Both have the same shape: a
self-hosted environment (`config: {type: self_hosted}` in
`agents/*/environment.yaml`) is a work queue rather than a sandbox
template, a host process polls it with the environment key, and each
claimed session runs in its own short-lived container.

- [`docker/`](docker/) is the baseline, all `ant` CLI. The host runs
  `ant beta:worker poll` and each container runs `ant beta:worker run`.
  One credential, the environment key, everywhere, including inside the
  containers. An agent can read its container's environment, so in this
  variant the containers protect the host, not sessions from each other.
- [`docker-memory/`](docker-memory/) adds a memory store. The host side is
  the same CLI poller, and the container runs the Python SDK's
  `EnvironmentWorker`, which downloads the session's memory store to
  `/mnt/memory/...`, syncs edits back, and exits. The environment key never
  enters a container: each one authenticates with a per-session token
  instead, so a session cannot reach another session's work or memories.

Memory stores mount at a fixed path on the sandbox filesystem, so two
sessions on one unvirtualized machine would read and overwrite each
other's memories. One container per session is the recommended way to run
more than one session per host once memory is attached. The
`docker-memory/` README covers the mechanics.

In both, `./agents/setup.sh` creates the resources from YAML with the `ant` CLI and
writes their IDs to `.env`. The one manual step is the environment key,
which you mint in the Console for the environment `setup.sh` created.
