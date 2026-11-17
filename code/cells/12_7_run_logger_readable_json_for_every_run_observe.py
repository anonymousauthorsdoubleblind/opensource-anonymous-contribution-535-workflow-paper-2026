# @title 7. Run logger: readable JSON for every run (observer only, never changes the optimization)
import json, time, platform
from pathlib import Path

class RunLogger:
    """Writes, per run folder (flushed after every line, so a disconnect loses nothing):
         run_meta.json    arm, start, requirement, settings, seeds, models, versions, GPU
         steps.jsonl      one line per optimizer step           (also steps.json, pretty-printed, at the end)
         events.jsonl     one line per agent-related event      (also events.json, pretty-printed, at the end)
         geometries.npy   positions after every step (for the optional energy-map figure)
         summary.json     final energy, gradients, minutes, curvature check, success flags (written by the orchestrator)
       API waiting (rate limits, back-off) is measured separately: t_opt_s = wall time minus API time."""

    def __init__(self, run_dir, meta):
        self.dir = Path(run_dir); self.dir.mkdir(parents=True, exist_ok=True)
        self.t0 = time.time(); self.grad = 0; self.scf = 0; self.api_s = 0.0; self._geoms = []
        meta = {**meta, "started": time.strftime("%Y-%m-%dT%H:%M:%S"), "python": platform.python_version()}
        (self.dir / "run_meta.json").write_text(json.dumps(meta, indent=2, default=str))
        for f in ("steps.jsonl", "events.jsonl"):
            (self.dir / f).write_text("")
        self._fs = open(self.dir / "steps.jsonl", "a"); self._fe = open(self.dir / "events.jsonl", "a")

    @staticmethod
    def _w(f, rec):
        f.write(json.dumps(rec, default=float) + "\n"); f.flush()

    def t_wall(self): return time.time() - self.t0
    def t_opt(self):  return max(0.0, self.t_wall() - self.api_s)
    def add_api_time(self, seconds): self.api_s += float(seconds)

    def step(self, pass_id, step, energy_eV, fmax_eV_A, max_move_A, maxstep_A, fmax_target, conv_tol,
             basis=None, scf_cycles=None, positions=None, **extra):
        rec = dict(pass_id=pass_id, step=step, energy_eV=energy_eV, fmax=fmax_eV_A, max_move=max_move_A,
                   maxstep=maxstep_A, fmax_target=fmax_target, conv_tol=conv_tol, basis=basis, scf_cycles=scf_cycles,
                   gradients=self.grad, t_s=round(self.t_wall(), 3), t_opt_s=round(self.t_opt(), 3), **extra)
        self._w(self._fs, rec)
        if positions is not None: self._geoms.append(np.asarray(positions, float).copy())

    def event(self, kind, pass_id=None, step=None, **rec):
        """kind: pass_start | trigger | agent_call | validator | action_applied | probation | probe | rollback | pass_end | note"""
        rec.update(kind=kind, pass_id=pass_id, step=step, gradients=self.grad,
                   t_s=round(self.t_wall(), 3), t_opt_s=round(self.t_opt(), 3))
        self._w(self._fe, rec)

    def close(self):
        if self._geoms: np.save(self.dir / "geometries.npy", np.array(self._geoms))
        self._fs.close(); self._fe.close()
        for name in ("steps", "events"):                                      # human-readable copies
            rows = [json.loads(l) for l in open(self.dir / f"{name}.jsonl") if l.strip()]
            (self.dir / f"{name}.json").write_text(json.dumps(rows, indent=1, default=float))

def load_run(run_dir):
    d = Path(run_dir); rd = lambda n: [json.loads(l) for l in open(d / n) if l.strip()] if (d / n).exists() else []
    out = dict(dir=d, meta=json.loads((d / "run_meta.json").read_text()), steps=rd("steps.jsonl"), events=rd("events.jsonl"))
    if (d / "summary.json").exists(): out["summary"] = json.loads((d / "summary.json").read_text())
    return out
print("Logger ready.")
