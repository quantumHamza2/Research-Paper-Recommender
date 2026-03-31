import pandas as pd

df = pd.read_csv("papers.csv")

# remove line breaks
df["abstract"] = df["abstract"].str.replace("\n", " ")

# convert authors list to string
df["authors"] = df["authors"].astype(str)

# remove empty abstracts
df = df.dropna(subset=["abstract"])

df.to_csv("clean_papers.csv", index=False)

print("Clean dataset saved.")