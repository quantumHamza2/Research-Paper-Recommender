FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 app
WORKDIR /app
RUN chown app:app /app
COPY requirements.txt ./
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && pip install --no-cache-dir -r requirements.txt
USER app
ENV HF_HOME=/home/app/.cache/huggingface PYTHONUNBUFFERED=1 ENABLE_INDEX_REBUILD=0 ENABLE_OLLAMA=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 TOKENIZERS_PARALLELISM=false
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
COPY --chown=app:app backend_api.py hosted_app.py prepare_demo.py clean_papers.csv ./
RUN python prepare_demo.py
COPY --from=frontend --chown=app:app /build/dist ./frontend/dist
EXPOSE 7860
CMD ["uvicorn", "hosted_app:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]
