# 📚 Research Paper Recommender

A full-stack machine learning system that recommends research papers using semantic similarity and vector search.

---

## 🚀 Overview

This project builds an intelligent research paper recommendation system using:

* Natural Language Processing (NLP)
* Embeddings for semantic understanding
* FAISS for fast similarity search
* A React frontend for visualization

Users can search for research topics and receive relevant papers based on semantic meaning rather than simple keyword matching.

---

## 🧠 Pipeline

1. **Data Collection**

   * Fetch research papers from arXiv (`fetch_arxiv.py`)

2. **Data Cleaning**

   * Preprocess and clean raw data (`clean_dataset.py`)

3. **Embedding Generation**

   * Convert papers into vector embeddings (`generate_embeddings.py`)

4. **Indexing**

   * Store embeddings using FAISS (`build_faiss_index.py`)

5. **Search & Recommendation**

   * Semantic search (`semantic_search.py`)
   * Recommendations (`recommend_papers.py`)

6. **Backend API**

   * Serve results via API (`backend_api.py`)

---

## 🛠️ Tech Stack

### Backend

* Python
* FAISS
* NumPy
* Pandas

### Frontend

* React
* Vite
* JavaScript

---

## ⚙️ Setup

```bash
git clone https://github.com/quantumHamza2/Research-Paper-Recommender.git
cd Research-Paper-Recommender
pip install -r requirements.txt
uvicorn backend_api:app --host 127.0.0.1 --port 8000
```

---

## 🔍 Features

* Semantic search using embeddings
* Fast similarity search with FAISS
* Research topic discovery
* Interactive frontend

---

## 👨‍💻 Author

Mohammad Hamza Khan

## Frontend and demo behavior

In another terminal: `cd frontend && npm ci && npm run dev`.
Start the API from the repository root so it can find the CSV files. First startup downloads `all-MiniLM-L6-v2` and builds a 1,000-paper sample if full artifacts are missing. Allow time for this step and check `/` for readiness. Sample mode stays in memory and preserves the full CSV and saved indexes. Retrieval normalizes both document and query embeddings and uses cosine similarity (FAISS inner product).

The optional Ollama synthesis needs a local Ollama server and the requested model. The default synthesizer extracts keywords/sentences; it is not an LLM. No retrieval-quality benchmark has been established yet.

`/rebuild_index` is disabled by default. Set `ENABLE_INDEX_REBUILD=1` only for a trusted local instance; it is an expensive operation that rewrites generated full-index artifacts. Do not expose that instance publicly. Back up full artifacts before rebuilding. Only load locally generated, trusted NumPy neighbor artifacts (the existing format uses pickle).

## Checks

Run `python -m unittest discover -s tests` with FastAPI, httpx, requests, NumPy, pandas and scikit-learn installed. Tests use stand-ins for the encoder, FAISS and clustering to check request limits and sample-data preservation without downloading models. Full retrieval/model integration is not covered by these checks.
