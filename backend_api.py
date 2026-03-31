from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import numpy as np
import pandas as pd
import faiss

from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Loading research map...")

paper_map = np.load("paper_map.npy")
paper_clusters = np.load("paper_clusters.npy")
paper_related = np.load("paper_related.npy", allow_pickle=True)

print("Loading dataset...")
df = pd.read_csv("clean_papers.csv")

print("Loading embeddings...")
embeddings = np.load("paper_embeddings.npy")

# 🔥 IMPORTANT: normalize embeddings (improves similarity quality)
faiss.normalize_L2(embeddings)

print("Loading FAISS...")
index = faiss.read_index("paper_index.faiss")

print("Loading model...")
model = SentenceTransformer("all-MiniLM-L6-v2")

print("Backend ready.")

@app.get("/")
def root():
    return {"message": "Backend running"}

# -------- SEARCH --------
@app.get("/search")
def search(query: str, k: int = 10):
    query_embedding = model.encode([query])
    faiss.normalize_L2(query_embedding)

    distances, indices = index.search(query_embedding, k)

    results = []
    for idx in indices[0]:
        results.append({
            "title": df.iloc[idx]["title"],
            "year": int(df.iloc[idx]["year"]),
            "abstract": df.iloc[idx]["abstract"],
            "pdf_url": df.iloc[idx]["pdf_url"]
        })

    return {"results": results}


# -------- GRAPH (FIXED) --------
@app.get("/graph")
def graph(query: str, k: int = 80):

    # Encode + normalize
    query_embedding = model.encode([query])
    faiss.normalize_L2(query_embedding)

    # 🔥 STEP 1: get large candidate pool
    distances, indices = index.search(query_embedding, 300)

    # 🔥 STEP 2: diversify results
    selected = indices[0][:k]

    print("QUERY:", query)
    print("SELECTED SAMPLE:", selected[:5])

    nodes = []
    for idx in selected:
        nodes.append({
            "related": paper_related[idx].tolist(),
            "id": int(idx),
            "title": df.iloc[idx]["title"],
            "year": int(df.iloc[idx]["year"]),
            "abstract": df.iloc[idx]["abstract"],
            "pdf_url": df.iloc[idx]["pdf_url"]
        })

    # 🔥 STEP 3: build similarity graph
    selected_embeddings = embeddings[selected]
    sim = cosine_similarity(selected_embeddings)

    edges = []
    threshold = 0.6   # 🔥 lower = better connectivity

    for i in range(len(selected)):
        for j in range(i + 1, len(selected)):
            if sim[i][j] > threshold:
                edges.append({
                    "source": int(selected[i]),
                    "target": int(selected[j])
                })

    return {"nodes": nodes, "edges": edges}


# -------- MAP --------
@app.get("/map")
def get_research_map(limit: int = 5000):

    nodes = []

    for i in range(min(limit, len(df))):
        nodes.append({
            "id": int(i),
            "x": float(paper_map[i][0]),
            "y": float(paper_map[i][1]),
            "cluster": int(paper_clusters[i]),
            "related": paper_related[i].tolist(),
            "title": df.iloc[i]["title"],
            "year": int(df.iloc[i]["year"]),
            "abstract": df.iloc[i]["abstract"],
            "pdf_url": df.iloc[i]["pdf_url"]
        })

    return {"nodes": nodes}