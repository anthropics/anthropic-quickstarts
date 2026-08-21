---
name: verify
description: Build the computer-use-demo image and drive the Streamlit UI headlessly to verify changes end-to-end.
---

# Verifying changes to this demo

The surface is the Streamlit app inside the container. Build the image from this directory, run it, and drive the UI with Playwright. `pytest`, `ruff`, and `pyright` are CI's job, not evidence.

## Build and run

```sh
docker build . -t computer-use-demo:verify
docker rm -f cu-verify 2>/dev/null
docker run -d --name cu-verify \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY -e WIDTH=1024 -e HEIGHT=768 \
  -p 18501:8501 -p 18080:8080 -p 16080:6080 computer-use-demo:verify
until curl -sf localhost:18501/_stcore/health >/dev/null; do sleep 1; done
```

A cold build takes several minutes (apt, LibreOffice, a pyenv Python compile). The `requirements.txt` layer is cached separately, so source-only changes rebuild in seconds.

To iterate without rebuilding, copy sources over the baked copy before the first browser session compiles the script:

```sh
docker cp computer_use_demo/. cu-verify:/home/computeruse/computer_use_demo/
```

Streamlit's file watcher does not notice `docker cp` replacements once a session has run. Recreate the container instead of `docker restart`, which fails on a stale X lock (`tint2: could not open display`).

## Drive the UI

Install Playwright in any venv (`pip install playwright && python -m playwright install chromium`) and run the script below. It sets the model, picks a tool version, optionally sets the thinking mode, sends a prompt, waits for the loop to go idle, then dumps the chat transcript and every HTTP exchange (request headers and JSON, response JSON) with auth headers redacted.

```sh
THINKING=Adaptive python drive.py 18501 claude-sonnet-5 computer_toolset_20260801 \
  "Take a screenshot, then zoom in on the taskbar and list the icons." out/ 240
```

Pass `-` for model or tool version to keep the default. `THINKING=Off|Adaptive|Extended` clicks that radio. `TOKEN_EFFICIENT=1` ticks the beta checkbox.

What to read afterwards:

- `out/chat.txt`: the rendered conversation, including `Tool Use: <name>` lines and any error box with its traceback.
- `out/exchange-NN.txt`: one file per API round trip. Check `tools`, `anthropic-beta`, and the `tool_use` / `tool_result` blocks here rather than trusting the chat rendering.
- `out/02-chat.png`, `out/04-http-logs-expanded.png`: full-page screenshots.

Useful probes: an older model with a newer tool version (expect a clean 400 in the error box, not a crash), toggling Thinking to Off before the first message, and switching models mid-session.

```python
"""drive.py <port> <model|-> <tool_version|-> <prompt> <outdir> [wait_secs]"""

import os
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

port, model, tool_version, prompt, outdir = sys.argv[1:6]
wait_secs = int(sys.argv[6]) if len(sys.argv) > 6 else 180
out = Path(outdir)
out.mkdir(parents=True, exist_ok=True)
MAIN = "[data-testid='stMain'], section.main, [data-testid='stAppViewContainer']"


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 1600})
    page.goto(f"http://localhost:{port}", wait_until="networkidle", timeout=120_000)
    page.wait_for_selector("text=Tool Versions", timeout=120_000)
    sidebar = page.locator("[data-testid='stSidebar']")

    model_input = page.get_by_label("Model", exact=True)
    if model != "-":
        model_input.fill(model)
        model_input.press("Enter")  # commits the text_input and fires on_change
        time.sleep(2)
    if tool_version != "-":
        sidebar.get_by_text(tool_version, exact=True).click()
        time.sleep(2)
    if thinking := os.environ.get("THINKING"):
        sidebar.get_by_text(thinking, exact=True).click()
        time.sleep(2)
    if os.environ.get("TOKEN_EFFICIENT"):
        sidebar.get_by_text("Enable token-efficient tools beta", exact=True).click()
        time.sleep(2)
    log(f"model={model_input.input_value()!r} tools={tool_version} thinking={thinking}")
    page.screenshot(path=str(out / "01-sidebar.png"), full_page=True)

    chat = page.locator("textarea[data-testid='stChatInputTextArea']")
    chat.fill(prompt)
    chat.press("Enter")
    log("prompt sent")

    # The status widget is present while the script (and so the sampling loop) runs.
    deadline = time.time() + wait_secs
    time.sleep(5)
    while time.time() < deadline:
        running = page.locator("[data-testid='stStatusWidget']").count() > 0
        msgs = page.locator("[data-testid='stChatMessage']").count()
        log(f"running={running} chat_messages={msgs}")
        if not running and msgs >= 2:
            time.sleep(4)
            if page.locator("[data-testid='stStatusWidget']").count() == 0:
                break
        time.sleep(5)

    page.screenshot(path=str(out / "02-chat.png"), full_page=True)
    (out / "chat.txt").write_text(page.locator(MAIN).first.inner_text(timeout=10_000))

    page.get_by_role("tab", name="HTTP Exchange Logs").click()
    time.sleep(3)
    expanders = page.locator("[data-testid='stExpander']")
    for i in range(expanders.count()):
        exp = expanders.nth(i)
        exp.locator("summary").click()
        time.sleep(1.5)
        txt = exp.inner_text(timeout=15_000)
        txt = re.sub(r"(?im)^(`?)(authorization|x-api-key): .*$", r"\1\2: [REDACTED]", txt)
        (out / f"exchange-{i + 1:02d}.txt").write_text(txt)
    page.screenshot(path=str(out / "04-http-logs-expanded.png"), full_page=True)
    log(f"captured {expanders.count()} exchanges")
    browser.close()
```

## Gotchas

- The sidebar requires a non-empty API key for the Anthropic provider before it renders the chat. `ANTHROPIC_API_KEY` in the container env pre-fills it.
- Each Playwright run is a fresh Streamlit session, so the HTTP exchange log only contains that run's requests. Capture it in the same run.
- If `PYTEST_DISABLE_PLUGIN_AUTOLOAD` is set in your shell, `pytest` silently skips every async test. Run with `-p pytest_asyncio` or unset it.
