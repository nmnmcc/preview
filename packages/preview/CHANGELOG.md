# @nmnmcc/preview

## 1.0.0

### Major Changes

- Add filesystem layout inspections with coordinates, element bounds, overlap
  evidence, automatic hints, exact checks, domain JSON, an annotated overview,
  and per-finding evidence. Artifact names now use `viewport=<name>` so viewport
  and matrix values share one clear form.
- Replace `ready()` with `emit(name)` and `done()`. A preview can now capture
  more than one named state. Each state has its own artifact directory.

### Patch Changes

- Inspect below-fold content correctly in full-page captures, and clean stale
  output for custom Preview source names.
- Add source repository metadata for npm releases.
- Keep capture active when Vite reloads a browser document while it discovers
  dependencies. Discard incomplete output from the old document.
