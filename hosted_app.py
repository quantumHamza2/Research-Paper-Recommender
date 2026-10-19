"""Serve the production interface and existing API from one origin."""
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from backend_api import app as api, startup_event

app = FastAPI()

@app.on_event("startup")
def start_backend():
    startup_event()

app.mount("/api", api)
app.mount("/", StaticFiles(directory=Path(__file__).parent / "frontend/dist", html=True), name="frontend")
