---
"@nmnmcc/preview": patch
---

Fix preview generation while the Vite dev server is starting. File changes before the server is listening no longer fail with "The Vite server has no reachable local URL". The plugin now keeps the scheduled work and runs it once the server has a local URL.
