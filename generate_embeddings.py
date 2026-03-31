from sentence_transformers import SentenceTransformer
import pandas as pd
import numpy as np

print("Loading dataset...")
df = pd.read_csv("clean_papers.csv")

texts = (df["title"] + " " + df["abstract"]).fillna("").tolist()

print("Loading model...")
model = SentenceTransformer("all-MiniLM-L6-v2")

print("Generating embeddings...")

embeddings = model.encode(
    texts,
    batch_size=64,
    show_progress_bar=True,
    convert_to_numpy=True
)

# 🔥 FORCE CLEAN NUMERIC ARRAY
embeddings = np.array(embeddings, dtype=np.float32)

print("Saving embeddings...")
np.save("paper_embeddings.npy", embeddings)

print("DONE:", embeddings.shape)