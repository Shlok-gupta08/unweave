#!/usr/bin/env bash
# ============================================================
# Unweave — Standalone Embedded Backend Launcher
# Automatically initializes embedded Python runtime & FastAPI
# ============================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_FRAMEWORK="$DIR/python/Frameworks/Python.framework/Versions/3.11"
PYTHON_BIN="$PYTHON_FRAMEWORK/bin/python3.11"
SITE_PACKAGES="$DIR/python/lib/python3.11/site-packages"

export PYTHONUNBUFFERED=1
export PATH="$DIR/bin:$SITE_PACKAGES/imageio_ffmpeg/binaries:/opt/homebrew/bin:/usr/local/bin:/opt/local/bin:$PATH"

if [ -f "$PYTHON_BIN" ]; then
    export PYTHONHOME="$PYTHON_FRAMEWORK"
    export PYTHONPATH="$SITE_PACKAGES:$DIR"
    exec "$PYTHON_BIN" -m uvicorn main:app --host 127.0.0.1 --port 8010 "$@"
else
    # Fallback to local virtual environment if embedded runtime not present
    if [ -f "$DIR/.venv/bin/python" ]; then
        exec "$DIR/.venv/bin/python" -m uvicorn main:app --host 127.0.0.1 --port 8010 "$@"
    else
        exec python3 -m uvicorn main:app --host 127.0.0.1 --port 8010 "$@"
    fi
fi
