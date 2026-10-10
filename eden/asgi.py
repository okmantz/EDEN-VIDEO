"""ASGI entry point: ``uvicorn eden.asgi:app``."""
from .main import create_app

app = create_app()
