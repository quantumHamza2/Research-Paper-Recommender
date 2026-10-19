# Public demo deployment

The Docker image builds the existing React interface and serves it with FastAPI on port 7860. The interface uses the same-origin `/api` routes in production; local Vite development retains port 8000. Set `VITE_API_BASE_URL` at frontend build time only when using a separate backend.

The demo uses the first 1,000 papers, initializes embeddings and the map at startup, and downloads the encoder at image build time. First startup may take time; `/api/` reports readiness. Public defaults disable Ollama generation and index rebuilding. Comparison remains extractive. Do not enable index rebuilding on a public instance.

For Hugging Face Docker Spaces, set the Space README metadata to:

```yaml
---
title: Research Explorer
sdk: docker
app_port: 7860
---
```

Upload the source including Dockerfile, requirements.txt, backend_api.py, hosted_app.py, clean_papers.csv and frontend. Keep credentials and local environments excluded. Use one worker to avoid loading the model multiple times.

Verification on 19 October 2026: frontend production build and 11 existing unit tests passed. The production server locally returned HTTP 200 for the interface, status, search and map; status reported 1,000 papers and rebuilding disabled. Model discovery returned no local models as configured. Docker image execution and public hosting are not yet verified; no public deployment URL exists yet.
