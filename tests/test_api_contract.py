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

class SynthesisSelectionTests(unittest.TestCase):
    def setUp(self):
        import pandas as pd
        self.client = TestClient(backend_api.app)
        self.papers = pd.DataFrame([
            {'title': 'Retrieval study', 'abstract': 'Semantic retrieval improves research discovery.', 'year': 2025},
            {'title': 'Ranking study', 'abstract': 'Ranking research papers improves search quality.', 'year': 2026},
        ])

    def test_repeated_selection_matches_single_selection(self):
        with patch.object(backend_api, 'df', self.papers):
            single = self.client.post('/synthesize', json={'paper_ids': [0]})
            repeated = self.client.post('/synthesize', json={'paper_ids': [0, 0]})
        self.assertEqual(single.status_code, 200)
        self.assertIn('covers 1 research papers', single.json()['synthesis'])
        self.assertEqual(repeated.json(), single.json())

    def test_ollama_receives_unique_papers_in_selection_order(self):
        with patch.object(backend_api, 'df', self.papers), patch.object(backend_api.requests, 'post') as generate:
            generate.return_value.status_code = 200
            generate.return_value.json.return_value = {'response': 'A review'}
            response = self.client.post('/synthesize', json={'paper_ids': [1, 0, 1], 'use_ollama': True})
        self.assertEqual(response.json()['synthesis'], 'A review')
        self.assertEqual(response.json()['mode'], 'llm')
        self.assertEqual([p['label'] for p in response.json()['sources']], ['P1', 'P2'])
        generate.assert_called_once()
        prompt = generate.call_args.kwargs['json']['prompt']
        self.assertEqual(prompt.count('Ranking study'), 1)
        self.assertEqual(prompt.count('Retrieval study'), 1)
        self.assertLess(prompt.index('Ranking study'), prompt.index('Retrieval study'))
        self.assertNotIn('[P3]', prompt)

    def test_failed_llm_returns_real_extractive_fallback(self):
        failures = [backend_api.requests.Timeout('slow'), backend_api.requests.ConnectionError('offline')]
        for failure in failures:
            with self.subTest(failure=failure), patch.object(backend_api, 'df', self.papers), patch.object(backend_api.requests, 'post', side_effect=failure):
                response = self.client.post('/synthesize', json={'paper_ids': [0, 1], 'use_ollama': True})
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data['mode'], 'extractive')
                self.assertIn('no LLM output', data['warning'])
                self.assertIn('Retrieval study', data['synthesis'])
                self.assertEqual(len(data['sources']), 2)

    def test_empty_llm_output_falls_back(self):
        with patch.object(backend_api, 'df', self.papers), patch.object(backend_api.requests, 'post') as generate:
            generate.return_value.json.return_value = {'response': '  '}
            data = self.client.post('/synthesize', json={'paper_ids': [0], 'use_ollama': True}).json()
        self.assertEqual(data['mode'], 'extractive')
        self.assertIsNotNone(data['warning'])

class ModelDiscoveryTests(unittest.TestCase):
    def test_installed_small_model_preferred(self):
        with patch.object(backend_api.requests, 'get') as tags:
            tags.return_value.json.return_value = {'models': [{'name': 'qwen3:8b'}, {'name': 'qwen2.5:1.5b'}]}
            data = TestClient(backend_api.app).get('/synthesis-status').json()
        self.assertEqual(data['default_model'], 'qwen2.5:1.5b')

    def test_offline_ollama_does_not_prevent_extractive_mode(self):
        with patch.object(backend_api.requests, 'get', side_effect=backend_api.requests.ConnectionError()):
            data = TestClient(backend_api.app).get('/synthesis-status').json()
        self.assertEqual(data, {'models': [], 'default_model': None})

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


class SearchAndLabelRegressionTests(unittest.TestCase):
    def test_whitespace_rejected_without_encoder(self):
        with patch.object(backend_api, 'model') as encoder:
            client = TestClient(backend_api.app)
            for endpoint in ('/search', '/graph'):
                self.assertEqual(client.get(endpoint, params={'query': ' \t\n'}).status_code, 422)
            encoder.encode.assert_not_called()

    def test_cluster_labels_rank_weight_not_alphabet(self):
        import pandas as pd
        import numpy as np
        papers = pd.DataFrame({'abstract': ['zebra zebra zebra apple banana carrot']})
        with patch.object(backend_api, 'df', papers), patch.object(backend_api, 'paper_clusters', np.array([0])):
            backend_api.compute_cluster_keywords()
            self.assertEqual(backend_api.cluster_keywords[0].split(', ')[0], 'zebra')
