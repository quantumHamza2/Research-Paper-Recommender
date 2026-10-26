# Retrieval diagnostic — 26 October 2026

This evaluates known-item lookup, not general relevance accuracy. The 30 queries were authored by the coding assistant after reading selected titles/abstracts, before running either ranker. Each query names one intended paper via its source URL. Labels have not been independently reviewed by a human. The first 1,000 CSV rows form the corpus, matching local sample mode.

| Method | Target in top 5 | MRR@5 | Median local query time |
|---|---:|---:|---:|
| TF-IDF lexical cosine | 28/30 | 0.797 | 0.57 ms |
| MiniLM + normalized FAISS inner product | 29/30 | 0.881 | 3.94 ms |

The one-query difference does not establish general superiority. MRR@5 rewards putting the known target earlier; it assigns zero when the target is outside the first five. Other retrieved papers may also be relevant. These timings include query encoding and ranking on one local CPU run; they exclude HTTP, cold startup and corpus embedding. They are not production latency or throughput claims.

## Reproduce

Install project dependencies and download/cache `sentence-transformers/all-MiniLM-L6-v2` once. The runner deliberately uses `local_files_only=True`, then:

```bash
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 TOKENIZERS_PARALLELISM=false HF_HUB_OFFLINE=1 python evaluate_retrieval.py
python -m unittest discover -s tests
```

An initial run without the thread settings crashed in this macOS numerical runtime. The recorded run uses one numerical thread. `results.json` records corpus/query SHA-256 checksums, platform, per-query rankings and timings. No scores were edited by hand. Changing the CSV order changes sample membership; missing or duplicated target URLs cause a validation failure.

## Failure review

- **q10**: Coordinate a humanoid robot and a person carrying objects together. Semantic hit: True; lexical hit: False. Intended source: https://arxiv.org/pdf/2603.03768v1.
- **q15**: Adapt visual features to the question rather than using a fixed image representation. Semantic hit: False; lexical hit: True. Intended source: https://arxiv.org/pdf/2603.02748v1.
- **q28**: Monitor and recover agent failures while an AI workflow is executing. Semantic hit: True; lexical hit: False. Intended source: https://arxiv.org/pdf/2603.00495v1.

## What remains unproven

- Independent human relevance judgments across multiple acceptable papers.
- Generalization to held-out queries from actual researchers, especially ambiguous and out-of-corpus requests.
- Full-corpus retrieval quality, user satisfaction or generated-answer factuality.
- Robust latency across repeated runs, devices and concurrent requests.

Do not tune on these queries and then call them a held-out test. A future independently authored set must be collected separately. Do not present Hit@5 as “97% recommendation accuracy” on a resume.
