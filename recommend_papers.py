import pandas as pd
import numpy as np
import faiss

# load dataset
df = pd.read_csv("clean_papers.csv")

embeddings = np.load("paper_embeddings.npy", mmap_mode="r")
num_papers, dimension = embeddings.shape
print(f"Loaded embeddings with shape: {embeddings.shape}")

# load FAISS index
index = faiss.read_index("paper_index.faiss")


def search_titles(keyword):
    matches = df[df["title"].str.contains(keyword, case=False, na=False)]
    return matches


def recommend_similar_papers(paper_index, k=5):

    query_vector = embeddings[paper_index].reshape(1, -1)

    distances, indices = index.search(query_vector, k + 1)

    similar_indices = indices[0][1:]

    return df.iloc[similar_indices][["title", "authors", "year", "categories"]]


keyword = input("Search paper title: ")

matches = search_titles(keyword)

if matches.empty:
    print("No papers found.")
    exit()

print("\nMatching Papers:\n")

for i, (idx, row) in enumerate(matches.iterrows()):
    print(f"{i}: {row['title']}")

choice = int(input("\nSelect paper number: "))

selected_index = matches.index[choice]

print("\nSelected Paper:\n")
print(df.iloc[selected_index]["title"])

results = recommend_similar_papers(selected_index)

print("\nRecommended Papers:\n")
print(results)