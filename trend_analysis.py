import pandas as pd
import numpy as np
from sklearn.cluster import KMeans

df = pd.read_csv("clean_papers.csv")

embeddings = np.load("paper_embeddings.npy", mmap_mode="r")
num_papers, dimension = embeddings.shape
print(f"Loaded embeddings with shape: {embeddings.shape}")



print("Clustering papers into topics...")

k = 20
kmeans = KMeans(n_clusters=k, random_state=42)

labels = kmeans.fit_predict(embeddings)

df["topic"] = labels

print("\nResearch Topic Growth:\n")

for topic in range(k):

    topic_papers = df[df["topic"] == topic]

    yearly_counts = topic_papers["year"].value_counts().sort_index()

    if len(yearly_counts) < 2:
        continue

    growth = yearly_counts.iloc[-1] - yearly_counts.iloc[0]

    print(f"\nTopic {topic}")
    print("Growth:", growth)
    print("Papers:")

    for title in topic_papers["title"].head(3):
        print("-", title)