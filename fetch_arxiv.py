import arxiv
import pandas as pd
from tqdm import tqdm

client = arxiv.Client()

categories = [
    "cat:cs.AI",
    "cat:cs.LG",
    "cat:cs.CL",
    "cat:cs.CV",
    "cat:cs.IR"
]

papers = []

for category in categories:

    print(f"\nFetching {category} papers...\n")

    search = arxiv.Search(
        query=category,
        max_results=10000,
        sort_by=arxiv.SortCriterion.SubmittedDate
    )

    for result in tqdm(client.results(search)):

        papers.append({
            "title": result.title,
            "authors": [author.name for author in result.authors],
            "abstract": result.summary.replace("\n", " "),
            "year": result.published.year,
            "categories": result.categories,
            "pdf_url": result.pdf_url
        })

df = pd.DataFrame(papers)

df.drop_duplicates(subset="title", inplace=True)

df.to_csv("papers.csv", index=False)

print("\nDataset saved with", len(df), "papers.")