#!/bin/bash
if ! command -v cargo &> /dev/null; then
    echo "Cargo (the package manager for Rust) is not present.  This is required for one of this module's dependencies."
    echo "See https://www.rust-lang.org/tools/install for installation instructions."
    exit 1
fi

python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r dev-requirements.txt
pre-commit install
