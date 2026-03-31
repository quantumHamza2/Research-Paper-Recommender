import numpy as np
import pandas as pd
import faiss
from sentence_transformers import SentenceTransformer

num_papers = 40261
dimension = 384

# load dataset
df = pd.read_csv("clean_papers.csv")

# load embeddings
embeddings = np.memmap(
    "paper_embeddings.npy",
    dtype="float32",
    mode="r",
    shape=(num_papers, dimension)
)

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