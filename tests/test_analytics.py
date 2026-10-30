import numpy as np
from hydroflex.analytics.pareto import pareto_mask, regret_matrix


def test_pareto_basic():
    pts = [(1, 5), (2, 3), (3, 4), (4, 1), (2, 3)]
    m = pareto_mask(pts)
    assert m.tolist() == [True, True, False, True, True]


def test_pareto_single_objective_ties():
    assert pareto_mask([(1, 1), (1, 1)]).all()
    assert pareto_mask([(1, 1), (1, 2)]).tolist() == [True, False]


def test_regret():
    r = regret_matrix(np.array([[1.0, 5.0], [2.0, 3.0]]))
    assert r.tolist() == [[0.0, 2.0], [1.0, 0.0]]
