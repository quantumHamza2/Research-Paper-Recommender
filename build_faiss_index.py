import numpy as np
import faiss

print("Loading embeddings...")
embeddings = np.load("paper_embeddings.npy")

d = embeddings.shape[1]

print("Building index...")
index = faiss.IndexFlatL2(d)
index.add(embeddings)

faiss.write_index(index, "paper_index.faiss")

print("Done.")