import sys
import types
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient

fake_encoder = types.ModuleType("sentence_transformers")
fake_encoder.SentenceTransformer = object
# Test-only stand-ins avoid network model downloads; numerical libraries stay real.
sys.modules["faiss"] = types.ModuleType("faiss")
sys.modules["sentence_transformers"] = fake_encoder
import backend_api

class ApiContractTests(unittest.TestCase):
    def setUp(self): self.client = TestClient(backend_api.app)
    def test_query_limits_rejected_before_encoding(self):
        for url in ("/search?query=test&k=-1", "/search?query=test&k=100000", "/graph?query=test&k=0", "/map?limit=-1", "/search?query="):
            with self.subTest(url=url): self.assertEqual(self.client.get(url).status_code, 422)
    def test_rebuild_disabled_by_default(self):
        with patch.dict('os.environ', {}, clear=True):
            self.assertEqual(self.client.post('/rebuild_index').status_code, 403)
    def test_rebuild_busy_is_rejected(self):
        with patch.dict('os.environ', {'ENABLE_INDEX_REBUILD':'1'}), patch.object(backend_api,'system_status','indexing'):
            self.assertEqual(self.client.post('/rebuild_index').status_code, 409)
    def test_synthesis_is_bounded(self):
        self.assertEqual(self.client.post('/synthesize',json={'paper_ids':list(range(21))}).status_code,422)

class SamplePreservationTests(unittest.TestCase):
    def test_sample_preserves_full_dataset_and_artifacts(self):
        import os
        import tempfile
        from pathlib import Path
        import numpy as np
        import pandas as pd
        class Index:
            def __init__(self, dimension): self.values = None
            def add(self, values): self.values = values.copy()
            def search(self, values, k):
                scores = values @ self.values.T
                indices = np.argsort(-scores, axis=1)[:, :k]
                return np.take_along_axis(scores, indices, axis=1), indices
        def normalize(values): values /= np.linalg.norm(values, axis=1, keepdims=True)
        fake_faiss = types.SimpleNamespace(IndexFlatIP=Index, normalize_L2=normalize)
        fake_umap = types.SimpleNamespace(UMAP=lambda **kw: types.SimpleNamespace(fit_transform=lambda x: x[:, :2]))
        fake_hdb = types.SimpleNamespace(HDBSCAN=lambda **kw: types.SimpleNamespace(fit_predict=lambda x: np.zeros(len(x),dtype=int)))
        fake_model = types.SimpleNamespace(encode=lambda texts, **kw: np.array([[i+1, 2, 3] for i in range(len(texts))],dtype=np.float32))
        original_cwd = os.getcwd()
        with tempfile.TemporaryDirectory() as folder:
            try:
                os.chdir(folder)
                pd.DataFrame({'title':['example']*30,'abstract':['research paper semantic retrieval']*30,'authors':['author']*30}).to_csv('clean_papers.csv',index=False)
                before = Path('clean_papers.csv').read_bytes()
                Path('paper_embeddings.npy').write_bytes(b'existing full artifact')
                with patch.object(backend_api, 'faiss', fake_faiss), patch.object(backend_api, 'model', fake_model), patch.dict(sys.modules, {'umap':fake_umap, 'hdbscan':fake_hdb}):
                    backend_api.build_sample_indices(20)
                self.assertEqual(Path('clean_papers.csv').read_bytes(),before)
                self.assertEqual(Path('paper_embeddings.npy').read_bytes(),b'existing full artifact')
                self.assertEqual(len(backend_api.df),20)
                np.testing.assert_allclose(np.linalg.norm(backend_api.index.values,axis=1),1,rtol=1e-6)
            finally: os.chdir(original_cwd)
