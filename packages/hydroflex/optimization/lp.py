"""Minimal vectorised sparse LP builder solved with HiGHS (highspy).

    minimise  c^T x + c0
    s.t.      row_lo <= A x <= row_hi
              col_lo <=   x <= col_hi

Variables and rows are allocated in blocks; coefficients are appended as COO triplets with numpy
broadcasting, which keeps model construction for ~10^6 non-zeros well under a second.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

import highspy
import numpy as np
import scipy.sparse as sp

INF = highspy.kHighsInf


@dataclass
class LPSolution:
    status: str
    optimal: bool
    objective: float
    x: np.ndarray
    row_dual: np.ndarray
    col_dual: np.ndarray
    row_activity: np.ndarray
    solve_seconds: float
    build_seconds: float
    iterations: dict
    n_vars: int
    n_rows: int
    n_nonzeros: int
    solver: str = "HiGHS"
    solver_version: str = ""


@dataclass
class LP:
    names: dict[str, np.ndarray] = field(default_factory=dict)
    _lo: list[np.ndarray] = field(default_factory=list)
    _hi: list[np.ndarray] = field(default_factory=list)
    _c: list[np.ndarray] = field(default_factory=list)
    _rlo: list[np.ndarray] = field(default_factory=list)
    _rhi: list[np.ndarray] = field(default_factory=list)
    _ri: list[np.ndarray] = field(default_factory=list)
    _ci: list[np.ndarray] = field(default_factory=list)
    _v: list[np.ndarray] = field(default_factory=list)
    rows: dict[str, np.ndarray] = field(default_factory=dict)
    n: int = 0
    m: int = 0
    c0: float = 0.0
    t0: float = field(default_factory=time.perf_counter)

    # -- variables ---------------------------------------------------------------------------
    def var(self, name: str, shape: int | tuple[int, ...], lb: float | np.ndarray = 0.0,
            ub: float | np.ndarray = INF, cost: float | np.ndarray = 0.0) -> np.ndarray:
        size = int(np.prod(shape))
        idx = np.arange(self.n, self.n + size).reshape(shape)
        self.n += size
        self._lo.append(np.broadcast_to(np.asarray(lb, float), shape).ravel().copy())
        self._hi.append(np.broadcast_to(np.asarray(ub, float), shape).ravel().copy())
        self._c.append(np.broadcast_to(np.asarray(cost, float), shape).ravel().copy())
        if name in self.names:
            raise KeyError(f"duplicate variable block {name}")
        self.names[name] = idx
        return idx

    # -- constraints --------------------------------------------------------------------------
    def rows_block(self, name: str, shape: int | tuple[int, ...], lo: float | np.ndarray,
                   hi: float | np.ndarray) -> np.ndarray:
        size = int(np.prod(shape))
        idx = np.arange(self.m, self.m + size).reshape(shape)
        self.m += size
        self._rlo.append(np.broadcast_to(np.asarray(lo, float), shape).ravel().copy())
        self._rhi.append(np.broadcast_to(np.asarray(hi, float), shape).ravel().copy())
        if name in self.rows:
            raise KeyError(f"duplicate row block {name}")
        self.rows[name] = idx
        return idx

    def coef(self, rows: np.ndarray, cols: np.ndarray, vals: float | np.ndarray) -> None:
        r, c, v = np.broadcast_arrays(np.asarray(rows), np.asarray(cols), np.asarray(vals, float))
        self._ri.append(r.ravel())
        self._ci.append(c.ravel())
        self._v.append(v.ravel())

    def add_cost(self, cols: np.ndarray, vals: float | np.ndarray) -> None:
        """Add to objective coefficients of already-created variables."""
        c = np.concatenate(self._c) if len(self._c) > 1 else self._c[0]
        cc, vv = np.broadcast_arrays(np.asarray(cols).ravel(), np.asarray(vals, float).ravel())
        np.add.at(c, cc, vv)
        self._c = [c]

    def fix(self, cols: np.ndarray, value: float | np.ndarray) -> None:
        lo = np.concatenate(self._lo)
        hi = np.concatenate(self._hi)
        lo[np.asarray(cols).ravel()] = value
        hi[np.asarray(cols).ravel()] = value
        self._lo, self._hi = [lo], [hi]

    # -- solve --------------------------------------------------------------------------------
    def solve(self, time_limit: float = 120.0, method: str = "choose", verbose: bool = False,
              threads: int = 0) -> LPSolution:
        build_t = time.perf_counter() - self.t0
        A = sp.csc_matrix((np.concatenate(self._v), (np.concatenate(self._ri), np.concatenate(self._ci))),
                          shape=(self.m, self.n))
        A.sum_duplicates()
        h = highspy.Highs()
        h.setOptionValue("output_flag", verbose)
        h.setOptionValue("time_limit", float(time_limit))
        h.setOptionValue("solver", method)
        if threads:
            h.setOptionValue("threads", threads)
        lp = highspy.HighsLp()
        lp.num_col_ = self.n
        lp.num_row_ = self.m
        lp.col_cost_ = np.concatenate(self._c)
        lp.col_lower_ = np.concatenate(self._lo)
        lp.col_upper_ = np.concatenate(self._hi)
        lp.row_lower_ = np.concatenate(self._rlo)
        lp.row_upper_ = np.concatenate(self._rhi)
        lp.offset_ = self.c0
        lp.a_matrix_.format_ = highspy.MatrixFormat.kColwise
        lp.a_matrix_.start_ = A.indptr
        lp.a_matrix_.index_ = A.indices
        lp.a_matrix_.value_ = A.data
        h.passModel(lp)
        t = time.perf_counter()
        h.run()
        solve_t = time.perf_counter() - t
        status = h.modelStatusToString(h.getModelStatus())
        optimal = h.getModelStatus() == highspy.HighsModelStatus.kOptimal
        sol = h.getSolution()
        info = h.getInfo()
        iters = {"simplex": int(info.simplex_iteration_count), "ipm": int(info.ipm_iteration_count),
                 "crossover": int(info.crossover_iteration_count)}
        try:
            ver = f"{h.version()}"
        except Exception:  # pragma: no cover
            ver = ""
        has = optimal and sol.value_valid
        return LPSolution(
            status=status, optimal=optimal,
            objective=float(info.objective_function_value) if has else float("nan"),
            x=np.asarray(sol.col_value) if has else np.full(self.n, np.nan),
            row_dual=np.asarray(sol.row_dual) if has and sol.dual_valid else np.full(self.m, np.nan),
            col_dual=np.asarray(sol.col_dual) if has and sol.dual_valid else np.full(self.n, np.nan),
            row_activity=np.asarray(sol.row_value) if has else np.full(self.m, np.nan),
            solve_seconds=solve_t, build_seconds=build_t, iterations=iters,
            n_vars=self.n, n_rows=self.m, n_nonzeros=int(A.nnz), solver_version=ver,
        )
