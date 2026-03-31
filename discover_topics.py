import numpy as np
import pandas as pd
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

print("Clustering research topics...")

kmeans = KMeans(n_clusters=20, random_state=42)

labels = kmeans.fit_predict(embeddings)

df["topic"] = labels

for topic in range(10):

    papers = df[df["topic"] == topic].head(5)

    print(f"\nTopic {topic}\n")

    for title in papers["title"]:
        print(title)