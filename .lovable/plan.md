# Upgrade Builder City to 3D

## Goal
Replace the flat city preview with a real, interactive 3D builder city while preserving the existing GitHub-generated buildings, developer levels, selection details, and profile navigation.

## What will change
- Render each verified repository as a distinct low-poly 3D building whose height and detail reflect its developer level.
- Add a prominent 3D Builder HQ showing the connected GitHub identity and city level.
- Replace the blank grid with a designed city landscape: raised terrain, roads, sidewalks, trees, lamps, water/park details, district markings, and a skyline backdrop.
- Allow drag-to-orbit and scroll/pinch zoom, with sensible limits and a reset-view control.
- Keep building selection functional and show the existing repository details in a readable overlay.
- Provide a lightweight fallback while the 3D view loads or WebGL is unavailable.

## Visual direction
- Architectural model / Sui builder campus rather than a casino or generic neon city.
- Preserve Blast Build’s cream, ink, red, and cyan identity.
- Use warm daylight, soft shadows, varied materials, and subtle ambient movement so the city feels alive without obscuring project information.

## Technical details
- Add React Three Fiber, Three.js, and Drei using React 19-compatible versions.
- Keep browser-only 3D code isolated from server rendering and lazily load it from the existing `BuilderCity` interface.
- Use procedural geometry and deterministic placement, avoiding external model dependencies and random hydration differences.
- Cap rendering quality for mobile devices and respect reduced-motion preferences.

## Validation
- Verify the signed-in `/build` city and a public builder city on desktop and mobile.
- Confirm orbit, zoom, building selection, detail display, and profile navigation.
- Check screenshots for a fully lit, nonblank scene with no overflow, console errors, or hydration warnings.
