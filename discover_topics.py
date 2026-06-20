import numpy as np
import pandas as pd
from sklearn.cluster import KMeans

df = pd.read_csv("clean_papers.csv")

embeddings = np.load("paper_embeddings.npy", mmap_mode="r")
num_papers, dimension = embeddings.shape
print(f"Loaded embeddings with shape: {embeddings.shape}")


print("Clustering research topics...")

kmeans = KMeans(n_clusters=20, random_state=42)

labels = kmeans.fit_predict(embeddings)

df["topic"] = labels

for topic in range(10):

    papers = df[df["topic"] == topic].head(5)

    print(f"\nTopic {topic}\n")

    for title in papers["title"]:
        print(title)