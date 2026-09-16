# Blast Island — 100-City 3D Builder Map

## Goal
Replace the current flat developer-dot atlas with a navigable 3D tropical Blast Island overview. The island map and each developer’s full Builder City remain two separate experiences.

## What will change
- Build a dedicated 3D Blast Island map, separate from the existing individual Builder City scene.
- Populate the island with up to 100 real Sui developers discovered from active Sui GitHub repositories.
- Merge registered Blast Build profiles into those results, so a developer who has registered uses their verified Builder Score and public city link.
- Render every developer as a small city cluster rather than a pin:
  - city footprint, density, and tower height scale with GitHub/Builder Score;
  - high-score developers read as major cities;
  - lower-score developers read as small towns.
- Use a helicopter-style starting camera with rotate and zoom controls, similar to a 3D map.
- Selecting a city focuses it and opens a compact developer panel with score, project count, city size, and registration status.
- Show **See the city** only for registered developers; it opens their existing full 3D Builder City in the separate city experience.
- For discovered developers who have not registered, show their GitHub profile instead of inventing a Builder City.

## Page structure
1. **Island Map box** — the 3D Sui-shaped tropical island containing up to 100 developer cities.
2. **Selected City box** — developer details and the **See the city** action when a verified city exists.

The existing rankings and individual Builder City pages remain unchanged.

## Technical details
- Extend the existing server-side GitHub discovery to aggregate repositories by owner and return up to 100 real Sui developers.
- Combine public registered builders with discovered developers using normalized GitHub usernames.
- Add a lazy-loaded React Three Fiber island-atlas canvas so server rendering stays safe.
- Use deterministic seeded placement inside the Sui-droplet footprint, avoiding random city movement between visits.
- Keep the scene within the mobile GPU budget by using shared geometries/materials and instanced buildings where practical.
- Add accessible city selection outside the canvas and keep mobile controls touch-sized.

## Validation
- Verify 100 real developer cities can render without a blank canvas.
- Verify large/small visual scaling follows score.
- Verify rotate, zoom, city selection, focus, and **See the city** navigation.
- Verify desktop and mobile layouts, no horizontal overflow, and no console errors.
