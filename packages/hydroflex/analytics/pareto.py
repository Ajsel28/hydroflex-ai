"""Pareto (non-dominated) set and regret utilities."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np


def pareto_mask(points: Sequence[Sequence[float]], tol: float = 1e-9) -> np.ndarray:
    """Boolean mask of non-dominated points when every objective is minimised.

    Point i is dominated if some j is <= in all objectives and < in at least one (beyond ``tol``).
    Duplicate points are all kept as non-dominated.
    """
    P = np.asarray(points, dtype=float)
    n = len(P)
    keep = np.ones(n, dtype=bool)
    for i in range(n):
        le = np.all(P <= P[i] + tol, axis=1)
        lt = np.any(P < P[i] - tol, axis=1)
        if np.any(le & lt):
            keep[i] = False
    return keep


def regret_matrix(costs: np.ndarray) -> np.ndarray:
    """costs[strategy, scenario] -> regret = cost - min over strategies (per scenario)."""
    c = np.asarray(costs, dtype=float)
    return c - c.min(axis=0, keepdims=True)
