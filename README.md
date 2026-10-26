# Research Explorer

Search, inspect and compare research-paper abstracts with a React interface and Python API. The project combines MiniLM embeddings, exact FAISS retrieval, a similarity graph and a two-dimensional topic map.

**Status:** local prototype. Public hosting is not verified. The default fallback corpus is the first 1,000 records; optional local generation is not required for search or extractive comparison.

## Evidence you can inspect

- [Retrieval diagnostic and limitations](evaluation/REPORT.md): 30 agent-authored known-item queries, a TF-IDF baseline, per-query rankings and reproducible output. This is not independently judged recommendation accuracy.
- [Code walkthrough and 90-second demo](docs/INTERVIEW_WALKTHROUGH.md): exact functions, explanations and debugging exercises.
- [API regression tests](tests/test_api_contract.py): bounded requests, data preservation, whitespace validation, ranked topic labels, model discovery and actual fallback behavior.

## Quick start

Use Python 3.11–3.13 and a current Node version supported by the frontend's Vite dependency. From the repository root:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend_api:app --host 127.0.0.1 --port 8000
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Open the local URL printed by Vite. Leave both processes running. First startup downloads `all-MiniLM-L6-v2` if not cached, encodes a sample and builds the map. `http://127.0.0.1:8000/` reports readiness. A running HTTP server alone does not mean the index is ready. If the numerical runtime crashes on macOS, restart with `OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 TOKENIZERS_PARALLELISM=false` before the uvicorn command.

## How it works

1. The checked-in CSV contains arXiv metadata. `fetch_arxiv.py` and `clean_dataset.py` support collection/preparation.
2. `build_sample_indices` combines title and abstract, encodes them with MiniLM, normalizes vectors and builds FAISS `IndexFlatIP` in memory. It does not replace the full CSV or saved artifacts.
3. `/search` encodes and normalizes a query and maps ranked vector IDs back to paper metadata. It searches this corpus, not the live web.
4. `/paper/{id}` returns abstract, authors, categories and original source link. IDs are corpus row positions.
5. `/graph` diversifies up to 200 candidates using maximum marginal relevance (weight 0.5) and draws edges above cosine similarity 0.55. Edges represent textual similarity, not citations.
6. `/map` shows UMAP coordinates; HDBSCAN groups those projected points. Cluster -1 denotes noise/unassigned papers. Labels use ranked mean TF-IDF weights. Projection and labels are approximate discovery aids.
7. `/synthesize` defaults to TF-IDF keywords and extracted sentences. Optional Ollama receives only selected abstracts; unavailable or empty generation produces an extractive response with a warning and source labels.

## Optional local model

Start Ollama separately and install a model you can run. `/synthesis-status` discovers installed models and prefers `qwen2.5:1.5b`. Generated comparisons can contain unsupported claims or missing citations; inspect the abstracts. This is not full-PDF analysis or a verified literature review.

## Verification

```bash
pip install httpx
python -m unittest discover -s tests
npm run build --prefix frontend
```

The 15 unit tests use encoder/FAISS stand-ins for API checks, and do not prove real-model retrieval quality. The separate [diagnostic runner](evaluate_retrieval.py) uses the real cached MiniLM encoder and FAISS against 1,000 corpus records. See its report for reproduction and the recorded results; no independent human relevance benchmark exists yet.

## Limits and safe defaults

- Exact search, pairwise graph comparisons and a 1,000-record sample have not been validated at production scale.
- UMAP distance is not a scientific similarity measurement; abstract vocabulary overlap does not establish methodological agreement.
- Out-of-corpus queries can still receive nearest neighbors. There is no calibrated abstention threshold.
- `/rebuild_index` is disabled by default. Enable only in a trusted local instance with `ENABLE_INDEX_REBUILD=1`; full rebuild writes remain non-atomic.
- Only load trusted locally generated neighbor artifacts: the legacy NumPy format uses pickle.
- Corpus-derived evaluation queries favor known-item lookup. They are not held-out research tasks or user satisfaction evidence.

## Author and development

Mohammad Hamza Khan. Developed with AI-assisted coding, testing and documentation. The evaluation queries were authored by the coding assistant and have not received independent human relevance review. See repository history for changes; no production impact or deployment is claimed.
