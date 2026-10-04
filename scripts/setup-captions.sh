#!/bin/sh
set -eu
python3 -m venv data/captions-venv
data/captions-venv/bin/pip install -r scripts/caption-requirements.txt
data/captions-venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('tiny', device='cpu', compute_type='int8', download_root='./data/models')"
