# 3D Builder City Upgrade

## Goal
Make every Builder City render reliably as a detailed, interactive 3D landscape that clearly identifies who owns each repository building.

## What will change
- Replace the current fragile loading path with a browser-safe city renderer and a clear fallback if WebGL fails.
- Add a richer landscape around the owned plots: layered terrain, roads, water, trees, skyline buildings, distant hills, and atmospheric depth.
- Add visible controls for rotate left/right, zoom in/out, reset, and a one-tap helicopter/top-down view.
- Add a level filter so the viewer can switch between all buildings or focus on a selected developer level.
- Show `@owner / repository`, building type, developer level, and Sui relevance when a building is hovered or selected.
- Keep the current Builder Power, City Power, BLAST rules, GitHub scoring, and all Phase 1–4 data behavior unchanged.

## Technical details
- Keep React Three Fiber and the existing client-only lazy loading.
- Control the camera through a scene API so toolbar buttons animate the existing orbit camera instead of rebuilding the canvas.
- Use deterministic procedural geometry and local materials only; no remote 3D assets or runtime environment downloads.
- Derive repository ownership from the existing builder username/full repository name and pass it into the city building model.
- Preserve touch orbit/pinch zoom and desktop drag/wheel behavior.

## Verification
- Test `/build` and a public `/builder/:username` city on desktop and mobile.
- Confirm the canvas is nonblank, the landscape is visible, and camera controls work.
- Select a building and confirm its owner, repository, level, and Sui score appear.
- Confirm no horizontal overflow, hydration errors, missing assets, or blocking browser errors.
