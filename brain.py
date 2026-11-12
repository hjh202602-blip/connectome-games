"""Real connectomes used as fixed 'reservoir' brains.

worm: C. elegans, all 302 neurons (Cook et al. 2019, via the `cect` package).
fly : a ~2,000-neuron circuit cut out of the FlyWire whole adult Drosophila brain
      (Dorkenwald et al. 2024; signed weights from Shiu et al. 2024).

The wiring is never changed. Game input is injected only into sensory neurons,
the move is read only from output neurons (worm: inter/motor, fly: descending
neurons that send commands from brain to body). Only the linear readout on top
is trained (reservoir computing).
"""
import os
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg  # noqa: F401  (makes sp.linalg available)

HERE = os.path.dirname(os.path.abspath(__file__))
FLY_DIR = os.path.join(HERE, "fly_data")

LEAK = 0.5      # how fast a neuron follows its input (graded potential)
STEPS = 8       # settling steps per decision
RIDGE = 1e-2


class Wiring:
    def __init__(self, key, label, W, sensory, readout, info, row_gain=None):
        self.key, self.label, self.info = key, label, info
        W = sp.csr_matrix(W, dtype=np.float32)
        if row_gain:
            # every neuron gets the same total input strength; keeps signals alive
            # across the many layers of a big, sparsely-entered circuit
            rs = np.asarray(abs(W).sum(1)).ravel()
            rs[rs == 0] = 1
            W = sp.diags((row_gain / rs).astype(np.float32)) @ W
        else:
            rho = abs(sp.linalg.eigs(W, k=1, which="LM", return_eigenvectors=False)[0])
            W = W * (0.9 / rho)
        self.W = W.toarray().astype(np.float32)  # dense BLAS beats sparse at this size
        self.sensory, self.readout = sensory, readout
        self.N = len(sensory)
        # display order: inputs first, outputs last
        self.order = np.concatenate([np.where(sensory)[0],
                                     np.where(~sensory & ~readout)[0], np.where(readout)[0]])


# ---------------------------------------------------------------- worm
GABA_WORM = {"RMED", "RMEV", "RMEL", "RMER", "AVL", "DVB", "RIS",
             *[f"DD{i}" for i in range(1, 7)], *[f"VD{i}" for i in range(1, 14)]}


def worm_wiring():
    from cect import Cells
    data = os.path.join(os.path.dirname(Cells.__file__), "data", "herm_full_edgelist.csv")
    names = list(Cells.PREFERRED_HERM_NEURON_NAMES_COOK)
    idx = {n: i for i, n in enumerate(names)}
    n = len(names)
    chem, gap = np.zeros((n, n)), np.zeros((n, n))
    with open(data, encoding="utf-8") as f:
        next(f)
        for line in f:
            src, dst, w, kind = [s.strip() for s in line.split(",")]
            if src in idx and dst in idx:
                i, j = idx[dst], idx[src]
                if kind == "chemical":
                    chem[i, j] += float(w)
                else:
                    gap[i, j] += float(w)
                    gap[j, i] += float(w)
    sign = np.array([-1.0 if nm in GABA_WORM else 1.0 for nm in names])
    G = np.log1p(gap / 2)
    W = np.log1p(chem) * sign[None, :] + 0.5 * (G - np.diag(G.sum(1)))
    sensory = np.array([nm in set(Cells.SENSORY_NEURONS_COOK) for nm in names])
    info = [f"화학 시냅스 {(chem > 0).sum()} · 갭정션 {(gap > 0).sum() // 2}",
            f"앞 {sensory.sum()}개 = 감각 뉴런 (게임 입력)",
            "나머지 = 중간·운동 뉴런 (수를 읽음)"]
    return Wiring("worm", "꼬마선충", W, sensory, ~sensory, info)


# ---------------------------------------------------------------- fly
N_SENS, N_CENT, N_DESC = 200, 1600, 200
FLY_CACHE = os.path.join(FLY_DIR, "fly_circuit.npz")


def build_fly_circuit():
    """Cut a sensory -> central -> descending circuit out of the whole fly brain."""
    import pandas as pd
    con = pd.read_parquet(os.path.join(FLY_DIR, "Connectivity_783.parquet"),
                          columns=["Presynaptic_ID", "Postsynaptic_ID", "Excitatory x Connectivity"])
    con.columns = ["pre", "post", "w"]
    ann = pd.read_csv(os.path.join(FLY_DIR, "neuron_annotations.tsv"), sep="\t",
                      usecols=["root_id", "super_class", "cell_class"], dtype={"root_id": "int64"})
    cls = ann.set_index("root_id")
    sens_ids = set(cls.index[(cls.super_class == "sensory") & (cls.cell_class != "visual")])
    desc_ids = set(cls.index[cls.super_class == "descending"])
    cent_ids = set(cls.index[cls.super_class == "central"])
    con["aw"] = con.w.abs()

    # descending neurons with the most input from central neurons
    to_desc = con[con.post.isin(desc_ids) & con.pre.isin(cent_ids)]
    desc = to_desc.groupby("post").aw.sum().nlargest(N_DESC).index
    # sensory neurons with the most output onto central neurons
    from_sens = con[con.pre.isin(sens_ids) & con.post.isin(cent_ids)]
    sens = from_sens.groupby("pre").aw.sum().nlargest(N_SENS).index
    # central neurons that both hear the chosen sensory neurons and talk to the chosen descending ones
    s_in = from_sens[from_sens.pre.isin(sens)].groupby("post").aw.sum()
    d_out = to_desc[to_desc.post.isin(desc)].groupby("pre").aw.sum()
    # half the central neurons are picked for listening to the senses, half for driving the outputs
    cent = list(s_in.nlargest(N_CENT // 2).index)
    taken = set(cent)
    cent += [i for i in d_out.sort_values(ascending=False).index if i not in taken][:N_CENT - len(cent)]
    cent = np.array(cent)

    ids = np.concatenate([sens, cent, desc])
    idx = pd.Series(np.arange(len(ids)), index=ids)
    sub = con[con.pre.isin(idx.index) & con.post.isin(idx.index)]
    rows, cols = idx[sub.post].values, idx[sub.pre].values
    w = np.sign(sub.w.values) * np.log1p(sub.aw.values)
    np.savez(FLY_CACHE, rows=rows, cols=cols, w=w, n=len(ids), ns=len(sens), nd=len(desc),
             n_syn=int(sub.aw.sum()))


def fly_wiring():
    if not os.path.exists(FLY_CACHE):
        build_fly_circuit()
    d = np.load(FLY_CACHE)
    n, ns, nd = int(d["n"]), int(d["ns"]), int(d["nd"])
    W = sp.coo_matrix((d["w"], (d["rows"], d["cols"])), shape=(n, n))
    sensory = np.zeros(n, bool)
    sensory[:ns] = True
    readout = np.zeros(n, bool)
    readout[n - nd:] = True
    info = [f"연결 {len(d['w']):,}개 · 시냅스 {int(d['n_syn']):,}개",
            f"앞 {ns}개 = 감각 뉴런 (게임 입력)",
            f"끝 {nd}개 = 하행 뉴런 (수를 읽음)"]
    return Wiring("fly", "초파리", W, sensory, readout, info, row_gain=8.0)


_WIRINGS = {}


def get_wiring(key):
    if key not in _WIRINGS:
        _WIRINGS[key] = worm_wiring() if key == "worm" else fly_wiring()
    return _WIRINGS[key]


# ---------------------------------------------------------------- brain
class Brain:
    def __init__(self, wiring, n_in, n_out, seed=0):
        rng = np.random.default_rng(seed)
        self.wiring = wiring
        N = wiring.N
        B = rng.normal(0, 1.0, (N, n_in)) * (rng.random((N, n_in)) < 0.3)
        B[~wiring.sensory] = 0.0  # input only reaches sensory neurons
        self.B = B.astype(np.float32)
        self.bias = rng.normal(0, 0.1, N).astype(np.float32)
        self.Wout = np.zeros((n_out, wiring.readout.sum() + 1))
        self.last_state = np.zeros(N)

    def states(self, X):
        """X: (batch, n_in) -> neuron activity after settling (batch, N)."""
        X = np.atleast_2d(X).astype(np.float32)
        # neurons x batch layout: sparse W @ dense is the fast direction
        drive = self.B @ X.T + self.bias[:, None]
        v = np.zeros_like(drive)
        W = self.wiring.W
        for _ in range(STEPS):
            v = (1 - LEAK) * v + LEAK * np.tanh(W @ v + drive)
        return v.T

    def _feat(self, V):
        return np.hstack([V[:, self.wiring.readout], np.ones((len(V), 1), np.float32)]).astype(np.float64)

    def predict(self, X, chunk=4000):
        return np.vstack([self._feat(self.states(X[i:i + chunk])) @ self.Wout.T
                          for i in range(0, len(X), chunk)])

    def fit(self, X, Y, chunk=4000):
        k = self.wiring.readout.sum() + 1
        A, Bm = np.zeros((k, k)), np.zeros((k, Y.shape[1]))
        for i in range(0, len(X), chunk):
            F = self._feat(self.states(X[i:i + chunk]))
            A += F.T @ F
            Bm += F.T @ Y[i:i + chunk]
        self.Wout = np.linalg.solve(A + RIDGE * np.eye(k), Bm).T

    def __call__(self, x):
        v = self.states(x)
        self.last_state = v[0]
        return (self._feat(v) @ self.Wout.T)[0]

    def save(self, path):
        np.savez(path, B=self.B, bias=self.bias, Wout=self.Wout)

    @classmethod
    def load(cls, wiring, path):
        d = np.load(path)
        b = cls(wiring, d["B"].shape[1], d["Wout"].shape[0])
        b.B, b.bias, b.Wout = d["B"], d["bias"], d["Wout"]
        return b
