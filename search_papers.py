import pandas as pd
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer

# load dataset
df = pd.read_csv("clean_papers.csv")

# load embeddings index
index = faiss.read_index("paper_index.faiss")

# load embedding model
model = SentenceTransformer("all-MiniLM-L6-v2")

def search_papers(query, k=5):
    
    # convert query to embedding
    query_vector = model.encode([query])
    
    # search FAISS index
    distances, indices = index.search(query_vector, k)
    
    results = df.iloc[indices[0]]
    
    return results[["title", "authors", "year", "categories"]]

query = input("Enter research topic: ")

results = search_papers(query)

print("\nRecommended Papers:\n")
print(results)