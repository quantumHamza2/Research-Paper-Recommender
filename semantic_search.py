import numpy as np
import pandas as pd
import faiss
from sentence_transformers import SentenceTransformer

df = pd.read_csv("clean_papers.csv")

embeddings = np.load("paper_embeddings.npy", mmap_mode="r")
num_papers, dimension = embeddings.shape
print(f"Loaded embeddings with shape: {embeddings.shape}")


# load FAISS index
index = faiss.read_index("paper_index.faiss")

# load embedding model
model = SentenceTransformer("all-MiniLM-L6-v2")

query = input("Enter research topic: ")

# encode query
query_embedding = model.encode([query]).astype("float32")

# search vector database
distances, indices = index.search(query_embedding, 10)

results = df.iloc[indices[0]]

print("\nTop Relevant Papers:\n")

for _, row in results.iterrows():
    print("Title:", row["title"])
    print("Authors:", row["authors"])
    print("Year:", row["year"])
    print("PDF:", row["pdf_url"])
    print()