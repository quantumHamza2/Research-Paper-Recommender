import numpy as np
import pandas as pd
import umap
import hdbscan
import faiss

print("Loading embeddings...")
embeddings = np.load("paper_embeddings.npy", mmap_mode="r")
num_papers, dimension = embeddings.shape
print(f"Loaded embeddings with shape: {embeddings.shape}")


print("Building FAISS index for similarity...")

# convert memmap to normal array
embeddings_np = np.array(embeddings)

# normalize for cosine similarity
faiss.normalize_L2(embeddings_np)

dim = embeddings_np.shape[1]
index = faiss.IndexFlatIP(dim)

index.add(embeddings_np)

top_k = 5
related = []

print("Finding nearest neighbors...")

distances, indices = index.search(embeddings_np, top_k + 1)

for i in range(len(indices)):
    related.append(indices[i][1:].tolist())  # skip itself

print("Running UMAP...")
reducer = umap.UMAP(
    n_neighbors=15,
    min_dist=0.1,
    metric="cosine",
    random_state=42
)

coords = reducer.fit_transform(embeddings_np)

print("Running HDBSCAN clustering...")
clusterer = hdbscan.HDBSCAN(
    min_cluster_size=20,
    metric="euclidean"
)

labels = clusterer.fit_predict(coords)

print("Saving outputs...")
np.save("paper_map.npy", coords)
np.save("paper_clusters.npy", labels)
np.save("paper_related.npy", np.array(related, dtype=object))

print("Done.")