"""Known-item diagnostic, not an independently judged relevance benchmark."""
import argparse
import hashlib
import json
import platform
import time
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer


def rank_metrics(ranking, target, k=5):
    hits = [i + 1 for i, value in enumerate(ranking[:k]) if value == target]
    return {'hit_at_5': int(bool(hits)), 'reciprocal_rank_at_5': 1 / hits[0] if hits else 0.0}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='evaluation/results.json')
    args = parser.parse_args()
    import sys
    sys.modules['tensorflow'] = None
    import faiss
    from sentence_transformers import SentenceTransformer
    corpus = Path('clean_papers.csv')
    df = pd.read_csv(corpus).head(1000).fillna('')
    queries = json.loads(Path('evaluation/queries.json').read_text())
    urls = df.pdf_url.tolist()
    for q in queries:
        if urls.count(q['target_url']) != 1:
            raise ValueError('Target must exist exactly once: ' + q['id'])
    texts = (df.title + ' ' + df.abstract).tolist()
    vectorizer = TfidfVectorizer(stop_words='english')
    lexical = vectorizer.fit_transform(texts)
    model = SentenceTransformer('all-MiniLM-L6-v2', local_files_only=True, device='cpu')
    started = time.perf_counter()
    embeddings = np.asarray(model.encode(texts, batch_size=32, show_progress_bar=True), dtype=np.float32)
    faiss.normalize_L2(embeddings)
    index = faiss.IndexFlatIP(embeddings.shape[1]); index.add(embeddings)
    build_seconds = time.perf_counter() - started
    model.encode(['warm up'])
    rows = []
    for q in queries:
        target = urls.index(q['target_url'])
        row = dict(q)
        for method in ('tfidf', 'minilm'):
            start = time.perf_counter()
            if method == 'tfidf':
                scores = (lexical @ vectorizer.transform([q['query']]).T).toarray().ravel()
                ranking = np.argsort(-scores, kind='stable')[:5].tolist()
            else:
                emb = np.asarray(model.encode([q['query']]), dtype=np.float32)
                faiss.normalize_L2(emb)
                _, positions = index.search(emb, 5); ranking = positions[0].tolist()
            elapsed = (time.perf_counter() - start) * 1000
            row[method] = {**rank_metrics(ranking, target), 'milliseconds': elapsed,
                           'top_5': [{'title': str(df.iloc[i].title), 'url': urls[i]} for i in ranking]}
        rows.append(row)
    summary = {}
    for method in ('tfidf', 'minilm'):
        summary[method] = {metric: float(np.mean([r[method][metric] for r in rows]))
                           for metric in ('hit_at_5', 'reciprocal_rank_at_5')}
        summary[method]['median_query_ms'] = float(np.median([r[method]['milliseconds'] for r in rows]))
    result = {'scope': '30 agent-authored known-item queries over first 1000 corpus rows; not general relevance accuracy',
              'corpus_sha256': hashlib.sha256(corpus.read_bytes()).hexdigest(),
              'queries_sha256': hashlib.sha256(Path('evaluation/queries.json').read_bytes()).hexdigest(),
              'platform': platform.platform(), 'device': 'cpu', 'papers': len(df), 'queries': len(queries),
              'embedding_and_index_seconds': build_seconds, 'summary': summary, 'details': rows,
              'limitations': ['Queries derived from target abstracts; selection bias and lexical overlap expected.',
                             'One known target per query; other returned papers may also be relevant.',
                             'No independent human labels, held-out test set, confidence intervals or production latency claims.',
                             'Local query timings include encoding but exclude HTTP, cold start and corpus preparation.']}
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(summary, indent=2))

if __name__ == '__main__':
    main()
