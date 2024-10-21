#!/bin/bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r dev-requirements.txt
pre-commit install
