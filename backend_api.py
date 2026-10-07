import sys
sys.modules['tensorflow'] = None

import os
import threading
import ast
import requests
from fastapi import FastAPI, BackgroundTasks, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List

import numpy as np
import pandas as pd
import faiss

from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global system state
df = None
embeddings = None
index = None
paper_map = None
paper_clusters = None
paper_related = None
model = None

system_status = "initializing"  # initializing, sample_mode, ready, error
indexing_progress = 0.0
status_message = "Starting up..."
cluster_keywords = {}

LOCK = threading.Lock()

def parse_categories(cat_str):
    if pd.isna(cat_str):
        return []
    cat_str = str(cat_str).strip()
    try:
        if cat_str.startswith("["):
            return [c.strip("'\" ") for c in ast.literal_eval(cat_str)]
        else:
            return [c.strip() for c in cat_str.split(",")]
    except:
        return [cat_str]

def compute_cluster_keywords():
    global df, paper_clusters, cluster_keywords
    print("Computing TF-IDF keywords for clusters...")
    cluster_keywords = {}
    if df is None or paper_clusters is None:
        return
        
    cluster_abstracts = {}
    for idx, c_id in enumerate(paper_clusters):
        if idx >= len(df):
            break
        c_id = int(c_id)
        abstract = df.iloc[idx]["abstract"]
        if pd.isna(abstract) or not str(abstract).strip():
            continue
        if c_id not in cluster_abstracts:
            cluster_abstracts[c_id] = []
        cluster_abstracts[c_id].append(str(abstract))
        
    for c_id, abstracts in cluster_abstracts.items():
        if not abstracts:
            cluster_keywords[c_id] = f"Cluster {c_id}"
            continue
        try:
            vectorizer = TfidfVectorizer(max_features=12, stop_words="english")
            vectorizer.fit(abstracts)
            features = vectorizer.get_feature_names_out()
            clean_features = [f for f in features if f.isalpha() and len(f) > 3]
            kw = clean_features[:3]
            if not kw:
                kw = list(features)[:3]
            cluster_keywords[c_id] = ", ".join(kw)
        except Exception as e:
            print(f"Error computing keywords for cluster {c_id}: {e}")
            cluster_keywords[c_id] = f"Cluster {c_id}"

def build_sample_indices(num_samples=1000):
    global df, embeddings, index, paper_map, paper_clusters, paper_related, model, status_message
    
    status_message = f"Building sample index ({num_samples} papers)..."
    print(status_message)
    
    # 1. Clean dataset if needed
    if not os.path.exists("clean_papers.csv"):
        if os.path.exists("papers.csv"):
            status_message = "Cleaning raw papers dataset..."
            raw_df = pd.read_csv("papers.csv")
            raw_df["abstract"] = raw_df["abstract"].str.replace("\n", " ").fillna("")
            raw_df["authors"] = raw_df["authors"].astype(str)
            raw_df = raw_df.dropna(subset=["abstract"])
            raw_df.to_csv("clean_papers.csv", index=False)
        else:
            raise FileNotFoundError("Neither 'clean_papers.csv' nor 'papers.csv' found.")
            
    df_full = pd.read_csv("clean_papers.csv")
    df_sample = df_full.head(num_samples).copy()
    
    # Sample mode is memory-only: never truncate the corpus or replace full artifacts.
    df = df_sample
    
    # 2. Embeddings
    status_message = "Generating sample embeddings..."
    texts = (df["title"] + " " + df["abstract"]).fillna("").tolist()
    sample_embeddings = model.encode(texts, batch_size=32, show_progress_bar=True, convert_to_numpy=True)
    sample_embeddings = np.array(sample_embeddings, dtype=np.float32)
    embeddings = sample_embeddings
    
    # 3. FAISS Index
    status_message = "Building sample FAISS index..."
    faiss.normalize_L2(embeddings)
    d = embeddings.shape[1]
    sample_index = faiss.IndexFlatIP(d)
    sample_index.add(embeddings)
    index = sample_index
    
    # 4. UMAP & Clustering
    status_message = "Clustering and mapping sample (UMAP/HDBSCAN)..."
    import umap
    import hdbscan
    
    # Normalize for cosine metrics
    embeddings_norm = embeddings.copy()
    faiss.normalize_L2(embeddings_norm)
    
    reducer = umap.UMAP(n_neighbors=15, min_dist=0.1, metric="cosine", random_state=42)
    coords = reducer.fit_transform(embeddings_norm)
    paper_map = coords
    
    clusterer = hdbscan.HDBSCAN(min_cluster_size=10, metric="euclidean")
    labels = clusterer.fit_predict(coords)
    paper_clusters = labels
    
    # Related Nearest Neighbors
    ip_index = faiss.IndexFlatIP(d)
    ip_index.add(embeddings_norm)
    _, indices = ip_index.search(embeddings_norm, min(6, len(df)))
    
    related = []
    for i in range(len(indices)):
        related.append(indices[i][1:].tolist())
    
    related_arr = np.array(related, dtype=object)
    paper_related = related_arr
    
    compute_cluster_keywords()
    status_message = f"Sample mode ready ({num_samples} papers)"
    print("Sample mode index built successfully.")

def initialize_system():
    global df, embeddings, index, paper_map, paper_clusters, paper_related, model, system_status, status_message
    
    with LOCK:
        try:
            print("Loading sentence model...")
            status_message = "Loading Sentence Transformer model..."
            model = SentenceTransformer("all-MiniLM-L6-v2")
            
            required_files = [
                "clean_papers.csv", "paper_embeddings.npy", 
                "paper_index.faiss", "paper_map.npy", 
                "paper_clusters.npy", "paper_related.npy"
            ]
            
            missing = [f for f in required_files if not os.path.exists(f)]
            
            if missing:
                print(f"Missing files: {missing}. Initiating sample fallback...")
                build_sample_indices(num_samples=1000)
                system_status = "sample_mode"
            else:
                status_message = "Loading datasets and indices..."
                df = pd.read_csv("clean_papers.csv")
                
                # Use robust np.load with mmap to handle varying sizes and skip header offsets
                embeddings = np.array(np.load("paper_embeddings.npy", allow_pickle=False), dtype=np.float32)
                faiss.normalize_L2(embeddings)
                paper_map = np.load("paper_map.npy", mmap_mode="r")
                paper_clusters = np.load("paper_clusters.npy")
                paper_related = np.load("paper_related.npy", allow_pickle=True)
                
                index = faiss.IndexFlatIP(embeddings.shape[1])
                index.add(embeddings)
                
                # Check dimensions consistency
                num_papers = len(df)
                if len(embeddings) != num_papers or len(paper_map) != num_papers:
                    print(f"Dimension mismatch (df: {num_papers}, embeddings: {len(embeddings)}, map: {len(paper_map)}). Rebuilding sample...")
                    build_sample_indices(num_samples=1000)
                    system_status = "sample_mode"
                else:
                    compute_cluster_keywords()
                    system_status = "ready"
                    status_message = "Fully loaded and ready."
                    
            print(f"System status: {system_status}. Papers: {len(df)}")
            
        except Exception as e:
            system_status = "error"
            status_message = f"Startup failed: {str(e)}"
            print(status_message)

@app.on_event("startup")
def startup_event():
    # Initialize in background thread so app starts immediately
    threading.Thread(target=initialize_system).start()

# -------- GENERAL STATUS --------
@app.get("/")
def root():
    return {
        "status": system_status,
        "message": status_message,
        "papers_count": len(df) if df is not None else 0,
        "indexing_progress": indexing_progress
    }

# -------- CLUSTERS ENDPOINT --------
@app.get("/clusters")
def get_clusters():
    return cluster_keywords

# -------- PAPER DETAILS --------
@app.get("/paper/{paper_id}")
def get_paper(paper_id: int):
    if df is None:
        raise HTTPException(status_code=503, detail="System initializing")
    if paper_id < 0 or paper_id >= len(df):
        raise HTTPException(status_code=404, detail="Paper not found")
        
    paper_row = df.iloc[paper_id]
    p_cluster = int(paper_clusters[paper_id]) if paper_clusters is not None and paper_id < len(paper_clusters) else -1
    p_related = paper_related[paper_id].tolist() if paper_related is not None and paper_id < len(paper_related) else []
    
    related_papers = []
    for r_idx in p_related:
        if 0 <= r_idx < len(df):
            related_papers.append({
                "id": int(r_idx),
                "title": df.iloc[r_idx]["title"]
            })

    return {
        "id": paper_id,
        "title": paper_row["title"],
        "authors": paper_row["authors"],
        "year": int(paper_row["year"]),
        "abstract": paper_row["abstract"],
        "pdf_url": paper_row["pdf_url"],
        "categories": parse_categories(paper_row.get("categories", "")),
        "cluster": p_cluster,
        "related": related_papers
    }

# -------- SEARCH --------
@app.get("/search")
def search(query: str = Query(..., min_length=1, max_length=1000), k: int = Query(10, ge=1, le=100)):
    if index is None or df is None:
        raise HTTPException(status_code=503, detail="System indexing or loading")
        
    query_embedding = model.encode([query])
    query_embedding = np.array(query_embedding, dtype=np.float32)
    faiss.normalize_L2(query_embedding)

    distances, indices = index.search(query_embedding, min(k, len(df)))

    results = []
    for i, idx in enumerate(indices[0]):
        if idx < 0 or idx >= len(df):
            continue
        results.append({
            "id": int(idx),
            "title": df.iloc[idx]["title"],
            "year": int(df.iloc[idx]["year"]),
            "abstract": df.iloc[idx]["abstract"],
            "pdf_url": df.iloc[idx]["pdf_url"]
        })

    return {"results": results}

# -------- GRAPH WITH MMR DIVERSIFICATION --------
@app.get("/graph")
def graph(query: str = Query(..., min_length=1, max_length=1000), k: int = Query(40, ge=1, le=100)):
    if index is None or df is None or embeddings is None:
        raise HTTPException(status_code=503, detail="System loading")

    # 1. Encode query
    query_embedding = model.encode([query])
    query_embedding = np.array(query_embedding, dtype=np.float32)
    faiss.normalize_L2(query_embedding)

    # 2. Get candidate pool (larger than k)
    candidate_size = min(200, len(df))
    distances, indices = index.search(query_embedding, candidate_size)
    candidate_indices = [idx for idx in indices[0] if 0 <= idx < len(df)]
    
    if not candidate_indices:
        return {"nodes": [], "edges": []}

    candidate_embs = np.array(embeddings[candidate_indices])
    faiss.normalize_L2(candidate_embs)
    
    # 3. Apply MMR
    lmbda = 0.5
    q_sims = cosine_similarity(candidate_embs, query_embedding.reshape(1, -1)).flatten()
    pairwise_sims = cosine_similarity(candidate_embs)
    
    selected_indices_in_pool = [0]
    remaining_indices_in_pool = list(range(1, len(candidate_indices)))
    
    limit_k = min(k, len(candidate_indices))
    while len(selected_indices_in_pool) < limit_k and remaining_indices_in_pool:
        best_score = -float('inf')
        best_pool_idx = -1
        
        for r_idx in remaining_indices_in_pool:
            max_sel_sim = max(pairwise_sims[r_idx, s_idx] for s_idx in selected_indices_in_pool)
            score = lmbda * q_sims[r_idx] - (1 - lmbda) * max_sel_sim
            if score > best_score:
                best_score = score
                best_pool_idx = r_idx
                
        if best_pool_idx != -1:
            selected_indices_in_pool.append(best_pool_idx)
            remaining_indices_in_pool.remove(best_pool_idx)
        else:
            break
            
    selected_paper_ids = [candidate_indices[i] for i in selected_indices_in_pool]

    # 4. Build nodes
    nodes = []
    for idx in selected_paper_ids:
        p_related = paper_related[idx].tolist() if paper_related is not None and idx < len(paper_related) else []
        nodes.append({
            "id": int(idx),
            "title": df.iloc[idx]["title"],
            "year": int(df.iloc[idx]["year"]),
            "pdf_url": df.iloc[idx]["pdf_url"],
            "cluster": int(paper_clusters[idx]) if paper_clusters is not None and idx < len(paper_clusters) else 0,
            "related": p_related
        })

    # 5. Build similarity graph edges
    selected_embeddings = np.array(embeddings[selected_paper_ids])
    faiss.normalize_L2(selected_embeddings)
    sim = cosine_similarity(selected_embeddings)

    edges = []
    threshold = 0.55
    for i in range(len(selected_paper_ids)):
        for j in range(i + 1, len(selected_paper_ids)):
            if sim[i][j] > threshold:
                edges.append({
                    "source": int(selected_paper_ids[i]),
                    "target": int(selected_paper_ids[j])
                })

    return {"nodes": nodes, "edges": edges}

# -------- MAP (LIGHTWEIGHT PAYLOAD WITH CATEGORIES) --------
@app.get("/map")
def get_research_map(limit: int = Query(5000, ge=1, le=10000)):
    if paper_map is None or df is None:
        raise HTTPException(status_code=503, detail="Map coordinates loading")

    nodes = []
    max_limit = min(limit, len(df), len(paper_map))
    for i in range(max_limit):
        nodes.append({
            "id": int(i),
            "x": float(paper_map[i][0]),
            "y": float(paper_map[i][1]),
            "cluster": int(paper_clusters[i]) if paper_clusters is not None and i < len(paper_clusters) else 0,
            "title": df.iloc[i]["title"],
            "year": int(df.iloc[i]["year"]),
            "categories": parse_categories(df.iloc[i].get("categories", ""))
        })

    return {"nodes": nodes}

# -------- SYNTHESIS API --------
class SynthesizeRequest(BaseModel):
    paper_ids: List[int] = Field(..., min_length=1, max_length=20)
    use_ollama: bool = False
    ollama_model: str = "llama3"

@app.post("/synthesize")
def synthesize(req: SynthesizeRequest):
    if df is None:
        raise HTTPException(status_code=503, detail="System initializing")
        
    selected_papers = []
    for p_id in req.paper_ids:
        if 0 <= p_id < len(df):
            selected_papers.append(df.iloc[p_id])
            
    if not selected_papers:
        return {"synthesis": "No valid papers selected for synthesis."}
        
    if req.use_ollama:
        prompt = "You are an expert AI research assistant. Synthesize a literature review summarizing the relationships, similarities, and differences between these research papers. Provide a structured review with Introduction, Common Methodologies, and Key Contrasts.\n\n"
        for idx, paper in enumerate(selected_papers):
            prompt += f"Paper {idx+1}: {paper['title']} ({paper['year']})\nAbstract: {paper['abstract']}\n\n"
            
        try:
            response = requests.post("http://localhost:11434/api/generate", json={
                "model": req.ollama_model,
                "prompt": prompt,
                "stream": False
            }, timeout=15)
            if response.status_code == 200:
                return {"synthesis": response.json().get("response", "No response from local LLM.")}
            else:
                return {"synthesis": f"Error: Local Ollama server returned code {response.status_code}. Make sure Ollama is running and '{req.ollama_model}' model is pulled."}
        except Exception as e:
            return {"synthesis": f"Failed to connect to local Ollama server at http://localhost:11434. Error: {str(e)}. Fallback to NLP Synthesizer."}
            
    # NLP Heuristic fallback synthesis
    try:
        abstracts = [str(p["abstract"]) for p in selected_papers]
        titles = [str(p["title"]) for p in selected_papers]
        
        # Calculate shared keywords
        vectorizer = TfidfVectorizer(stop_words="english")
        tfidf_matrix = vectorizer.fit_transform(abstracts)
        feature_names = vectorizer.get_feature_names_out()
        
        shared_scores = np.asarray(tfidf_matrix.sum(axis=0)).flatten()
        top_indices = shared_scores.argsort()[::-1][:5]
        shared_keywords = [feature_names[i] for i in top_indices if shared_scores[i] > 0]
        
        intro = f"This synthesis covers {len(selected_papers)} research papers focusing on topics such as **{', '.join(shared_keywords)}**.\n\n"
        
        methodology_section = "### 💡 Core Contributions & Methods\n"
        for idx, p in enumerate(selected_papers):
            sentences = str(p["abstract"]).split(".")
            best_sentence = sentences[0]
            for s in sentences:
                if any(kw in s.lower() for kw in shared_keywords) and len(s) > 30:
                    best_sentence = s
                    break
            methodology_section += f"* **{p['title']} ({p['year']})**: Contributes key ideas around *{best_sentence.strip()}*.\n"
            
        sim_matrix = cosine_similarity(tfidf_matrix)
        contrast_section = "\n### 🔄 Semantic Alignment & Contrasts\n"
        if len(selected_papers) >= 2:
            max_sim = -1
            most_sim_pair = (0, 1)
            for i in range(len(selected_papers)):
                for j in range(i+1, len(selected_papers)):
                    if sim_matrix[i][j] > max_sim:
                        max_sim = sim_matrix[i][j]
                        most_sim_pair = (i, j)
                        
            p1, p2 = most_sim_pair
            alignment_level = "High" if max_sim > 0.4 else "Moderate" if max_sim > 0.2 else "Low"
            contrast_section += f"The semantic similarity analysis indicates a **{alignment_level}** overlap (score: {max_sim:.2f}) between **\"{titles[p1]}\"** and **\"{titles[p2]}\"**, reflecting shared conceptual frameworks. "
            
            min_sim = 2
            least_sim_pair = (0, 1)
            for i in range(len(selected_papers)):
                for j in range(i+1, len(selected_papers)):
                    if sim_matrix[i][j] < min_sim:
                        min_sim = sim_matrix[i][j]
                        least_sim_pair = (i, j)
            lp1, lp2 = least_sim_pair
            contrast_section += f"Conversely, **\"{titles[lp1]}\"** and **\"{titles[lp2]}\"** present the greatest divergence (score: {min_sim:.2f}), highlighting contrasting research methodologies or domains.\n"
        else:
            contrast_section += "Select multiple papers to run comparative semantic overlap analysis.\n"
            
        return {"synthesis": intro + methodology_section + contrast_section}
    except Exception as e:
        return {"synthesis": f"Error performing semantic NLP synthesis: {str(e)}"}

# -------- BACKGROUND INDEX BUILDER --------
def run_full_indexing():
    global system_status, indexing_progress, status_message
    global df, embeddings, index, paper_map, paper_clusters, paper_related, model
    
    try:
        system_status = "indexing"
        indexing_progress = 0.0
        
        status_message = "1/5: Cleaning full raw papers dataset..."
        print(status_message)
        if not os.path.exists("papers.csv"):
            raise FileNotFoundError("papers.csv is missing. Place it in the root folder.")
            
        raw_df = pd.read_csv("papers.csv")
        raw_df["abstract"] = raw_df["abstract"].str.replace("\n", " ").fillna("")
        raw_df["authors"] = raw_df["authors"].astype(str)
        raw_df = raw_df.dropna(subset=["abstract"])
        raw_df.to_csv("clean_papers.csv", index=False)
        df_full = raw_df
        indexing_progress = 0.2
        
        status_message = "2/5: Generating all paper embeddings (~3-5 mins)..."
        print(status_message)
        texts = (df_full["title"] + " " + df_full["abstract"]).fillna("").tolist()
        
        batch_size = 512
        all_embs = []
        for start_idx in range(0, len(texts), batch_size):
            end_idx = min(start_idx + batch_size, len(texts))
            batch_texts = texts[start_idx:end_idx]
            batch_embs = model.encode(batch_texts, show_progress_bar=False, convert_to_numpy=True)
            all_embs.append(batch_embs)
            
            progress_ratio = start_idx / len(texts)
            indexing_progress = 0.2 + (progress_ratio * 0.3)
            status_message = f"2/5: Embedding papers ({end_idx}/{len(texts)})..."
            
        full_embeddings = np.concatenate(all_embs, axis=0).astype(np.float32)
        faiss.normalize_L2(full_embeddings)
        np.save("paper_embeddings.npy", full_embeddings)
        indexing_progress = 0.5
        
        status_message = "3/5: Building full FAISS index..."
        print(status_message)
        d = full_embeddings.shape[1]
        full_index = faiss.IndexFlatIP(d)
        full_index.add(full_embeddings)
        faiss.write_index(full_index, "paper_index.faiss")
        indexing_progress = 0.6
        
        status_message = "4/5: Calculating UMAP projection & clustering..."
        print(status_message)
        import umap
        import hdbscan
        
        full_embs_norm = full_embeddings.copy()
        faiss.normalize_L2(full_embs_norm)
        
        reducer = umap.UMAP(n_neighbors=15, min_dist=0.1, metric="cosine", random_state=42)
        coords = reducer.fit_transform(full_embs_norm)
        np.save("paper_map.npy", coords)
        indexing_progress = 0.8
        
        status_message = "4/5: Performing density clustering..."
        clusterer = hdbscan.HDBSCAN(min_cluster_size=20, metric="euclidean")
        labels = clusterer.fit_predict(coords)
        np.save("paper_clusters.npy", labels)
        indexing_progress = 0.9
        
        status_message = "5/5: Finding local neighborhood graphs..."
        print(status_message)
        ip_index = faiss.IndexFlatIP(d)
        ip_index.add(full_embs_norm)
        _, indices = ip_index.search(full_embs_norm, 6)
        
        related = []
        for i in range(len(indices)):
            related.append(indices[i][1:].tolist())
        related_arr = np.array(related, dtype=object)
        np.save("paper_related.npy", related_arr)
        
        with LOCK:
            df = df_full
            embeddings = full_embeddings
            index = full_index
            paper_map = coords
            paper_clusters = labels
            paper_related = related_arr
            compute_cluster_keywords()
            system_status = "ready"
            
        indexing_progress = 1.0
        status_message = "Full database index compilation complete!"
        print(status_message)
        
    except Exception as e:
        status_message = f"Indexing failed: {str(e)}"
        print(status_message)
        try:
            build_sample_indices(num_samples=1000)
            system_status = "sample_mode"
        except:
            system_status = "error"

@app.post("/rebuild_index")
def rebuild_index(background_tasks: BackgroundTasks):
    global system_status
    if os.getenv("ENABLE_INDEX_REBUILD") != "1":
        raise HTTPException(403, "Index rebuild is disabled. Enable only on a trusted local instance.")
    with LOCK:
        if system_status not in ("ready", "sample_mode"):
            raise HTTPException(409, "System is not ready to rebuild")
        system_status = "indexing"
    background_tasks.add_task(run_full_indexing)
    return {"message": "Rebuilding index started in background"}