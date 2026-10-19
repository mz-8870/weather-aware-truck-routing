"""Vercel Python serverless entrypoint: exposes the Django WSGI app as `app`."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from config.wsgi import application as app  # noqa: E402

