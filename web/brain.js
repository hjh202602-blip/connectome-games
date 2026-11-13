// Connectome reservoir brain, same math as brain.py:
//   drive = B x + bias
//   repeat STEPS: v = (1 - LEAK) v + LEAK tanh(W v + drive)
//   out = Wout [v[readout], 1]
(function (root) {
  function decode(b64, Type) {
    const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Type(bytes.buffer);
  }

  class Wiring {
    constructor(key, d) {
      this.key = key;
      this.label = d.label;
      this.N = d.n;
      this.info = d.info;
      this.indptr = decode(d.indptr, Int32Array);
      this.indices = decode(d.indices, Int32Array);
      this.weights = decode(d.weights, Float32Array);
      this.sensory = Int32Array.from(d.sensory);
      this.readout = Int32Array.from(d.readout);
      this.order = Int32Array.from(d.order);
    }
  }

  class Brain {
    constructor(wiring, g, leak, steps) {
      this.wiring = wiring;
      this.nIn = g.nIn;
      this.nOut = g.nOut;
      this.B = decode(g.B, Float32Array); // sensory rows only
      this.bias = decode(g.bias, Float32Array);
      this.Wout = decode(g.Wout, Float32Array);
      this.leak = leak;
      this.steps = steps;
      this.lastState = new Float32Array(wiring.N);
      this._v = new Float64Array(wiring.N);
      this._u = new Float64Array(wiring.N);
      this._drive = new Float64Array(wiring.N);
    }

    predict(x) {
      const w = this.wiring, N = w.N, nIn = this.nIn;
      const drive = this._drive, v = this._v, u = this._u;
      for (let i = 0; i < N; i++) drive[i] = this.bias[i];
      for (let s = 0; s < w.sensory.length; s++) {
        let acc = 0;
        const off = s * nIn;
        for (let j = 0; j < nIn; j++) acc += this.B[off + j] * x[j];
        drive[w.sensory[s]] += acc;
      }
      v.fill(0);
      const a = this.leak, ip = w.indptr, ix = w.indices, wt = w.weights;
      for (let t = 0; t < this.steps; t++) {
        for (let i = 0; i < N; i++) {
          let acc = drive[i];
          for (let k = ip[i]; k < ip[i + 1]; k++) acc += wt[k] * v[ix[k]];
          u[i] = (1 - a) * v[i] + a * Math.tanh(acc);
        }
        v.set(u);
      }
      this.lastState.set(v);
      const R = w.readout.length, out = new Float64Array(this.nOut);
      for (let o = 0; o < this.nOut; o++) {
        const off = o * (R + 1);
        let acc = this.Wout[off + R];
        for (let r = 0; r < R; r++) acc += this.Wout[off + r] * v[w.readout[r]];
        out[o] = acc;
      }
      return out;
    }
  }

  function loadBrains(data) {
    const out = {};
    for (const key of Object.keys(data.brains)) {
      const d = data.brains[key];
      const wiring = new Wiring(key, d);
      out[key] = {};
      for (const game of Object.keys(d.games)) out[key][game] = new Brain(wiring, d.games[game], data.leak, data.steps);
    }
    return out;
  }

  root.ConnectomeBrain = { loadBrains };
  if (typeof module !== "undefined") module.exports = root.ConnectomeBrain;
})(typeof window !== "undefined" ? window : globalThis);
