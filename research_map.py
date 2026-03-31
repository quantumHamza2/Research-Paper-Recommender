import numpy as np
import pandas as pd
import umap
import matplotlib.pyplot as plt
from sklearn.cluster import KMeans

num_papers = 40261
dimension = 384

df = pd.read_csv("clean_papers.csv")

embeddings = np.memmap(
    "paper_embeddings.npy",
    dtype="float32",
    mode="r",
    shape=(num_papers, dimension)
)

print("Running clustering...")

k = 15
kmeans = KMeans(n_clusters=k, random_state=42)
labels = kmeans.fit_predict(embeddings)

print("Running UMAP...")

reducer = umap.UMAP(n_components=2, random_state=42)
reduced = reducer.fit_transform(embeddings)

plt.figure(figsize=(10,8))

scatter = plt.scatter(
    reduced[:,0],
    reduced[:,1],
    c=labels,
    cmap="tab20",
    s=3,
    alpha=0.7
)

plt.title("AI Research Landscape (Clustered)")
plt.xlabel("UMAP-1")
plt.ylabel("UMAP-2")

plt.show()