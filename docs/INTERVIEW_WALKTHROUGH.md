# Research Explorer: explain, demonstrate, debug

This is a learning prototype developed with AI assistance. Describe the parts you can explain, and distinguish work you personally implemented from assisted changes. Do not describe this as production deployment or independently validated research.

## The code path to show

1. Open `frontend/src/App.jsx`. Find the search handler and the call through `frontend/src/api.js`. The browser sends the user's query to `/search`; it does not search the entire internet.
2. Open `backend_api.py`, `initialize_system` and `build_sample_indices`. The fallback uses the first 1,000 CSV rows. Each document is its title plus abstract. MiniLM encodes that text into a vector. L2 normalization makes the inner product equal cosine similarity. FAISS `IndexFlatIP` performs exact search; this is not an approximate index.
3. Show `search`. Strip and reject blank input, encode and normalize the query, ask the index for k nearest papers, then map integer row positions to metadata. Query and documents use the same encoder. The response is a ranked list; it is not a generated answer.
4. Show `get_paper`. A result ID selects one row; the details include abstract, original PDF URL, categories and related papers. IDs are row positions and may change if the corpus is rebuilt.
5. Show `graph`. Retrieve up to 200 candidates. Maximum marginal relevance chooses up to k nodes: 0.5 times query similarity minus 0.5 times similarity to the most similar already-selected node. This trades some relevance for variety. Among selected papers, draw an edge when cosine similarity exceeds 0.55. Edges are text similarity, not citations or causation. Threshold and weight are heuristics, not optimized scientific constants.
6. Show `build_sample_indices` for the map. UMAP projects embeddings to 2D; HDBSCAN clusters the 2D positions. Projection can distort relationships. Cluster -1 means unassigned/noise. `compute_cluster_keywords` summarizes abstracts with ranked mean TF-IDF weights; these labels are approximate topic hints.
7. Show `synthesize`. Default mode selects keywords/sentences from abstracts using TF-IDF. Optional Ollama receives only selected abstracts and returns a draft; it does not read full PDFs. A failed/empty/timed-out generation returns extractive output with a warning. Sources make checking possible, not guaranteed correctness.
8. Show `evaluation/REPORT.md` and `evaluate_retrieval.py`. Explain the difference between a known-target lookup test and an independently judged relevance benchmark. Show a failure as well as a success. Never call Hit@5 general accuracy.

## A 90-second demo (rehearse once with a timer)

0–15 sec, project home: “I built Research Explorer to help navigate a collection of research papers. It combines a React interface, Python APIs and semantic retrieval. This is a prototype, and I used AI assistance during development.”

15–35 sec, search and details: “A query is encoded with the same MiniLM model used for paper titles and abstracts. Normalized vectors are searched with FAISS, then the API returns the matching metadata. I can inspect the abstract and open the original source.”

35–50 sec, compare: “This comparison is extractive by default. The optional local model works from the selected abstracts; if generation fails, the interface labels the fallback instead of presenting it as a model answer.”

50–65 sec, graph/map: “The graph balances relevance and diversity, then connects similar papers. These links aren't citations. The map compresses vectors to two dimensions, so nearby points are a discovery aid rather than scientific evidence.”

65–85 sec, report/tests: “I added a reproducible comparison with a keyword baseline and regression tests for failures. The queries are agent-authored known-item checks, so these results are diagnostic, not a claim about real users' relevance judgments.”

85–90 sec: “The next step is independent relevance labels and testing on genuinely unseen user queries.”

## Five practical exercises before your interview

- Trace one query from the browser request to its returned title without reading a prepared speech.
- Explain what would change if embeddings were not normalized.
- Send a whitespace-only query and explain why 422 is preferable to arbitrary results.
- Change the graph threshold locally and describe the connectivity tradeoff; do not call more edges better.
- Turn off Ollama and verify extractive mode still works. Explain the observed response.

## Honest answers to hard questions

**Why not just keywords?** That is exactly what the baseline tests. Semantic similarity is useful for paraphrases but does not automatically beat lexical retrieval, especially for specific names and terminology.

**How do you know it is good?** The checked-in report measures known-target retrieval on a small biased diagnostic set. Independent human judgments and held-out user queries are still needed.

**Does it scale?** The demo is 1,000 papers. Exact vector search and pairwise graph similarities have limits; I haven't established production-scale performance.

**What did AI do?** Be specific about assisted code, tests and documentation. Explain what you ran and understood; don't claim manual authorship of assisted work.
