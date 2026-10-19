"""Precompute trusted demo artifacts at image build time, not on cold starts."""
import numpy as np
import faiss
import backend_api as backend

backend.model = backend.SentenceTransformer("all-MiniLM-L6-v2")
backend.build_sample_indices(1000)
backend.df.to_csv("clean_papers.csv", index=False)
np.save("paper_embeddings.npy", backend.embeddings)
np.save("paper_map.npy", backend.paper_map)
np.save("paper_clusters.npy", backend.paper_clusters)
np.save("paper_related.npy", np.asarray(backend.paper_related, dtype=np.int64))
faiss.write_index(backend.index, "paper_index.faiss")
