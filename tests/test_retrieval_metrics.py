import unittest
from evaluate_retrieval import rank_metrics

class MetricTests(unittest.TestCase):
    def test_rank_and_cutoff(self):
        self.assertEqual(rank_metrics([9, 7, 5, 2, 1], 7), {'hit_at_5': 1, 'reciprocal_rank_at_5': 0.5})
        self.assertEqual(rank_metrics([9, 7, 5, 2, 1, 3], 3), {'hit_at_5': 0, 'reciprocal_rank_at_5': 0.0})
    def test_empty_ranking(self):
        self.assertEqual(rank_metrics([], 7)['hit_at_5'], 0)
