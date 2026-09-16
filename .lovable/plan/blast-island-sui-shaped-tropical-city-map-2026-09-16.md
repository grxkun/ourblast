# Blast Island — Sui-Shaped Tropical City Map

## Goal
Turn the current 3D builder landscape into Blast Island: a tropical island whose silhouette reads as the Sui droplet/logo from helicopter view, with the builder’s city and several smaller city districts inside it.

## What will change
- Replace the rectangular ground and distant mainland skyline with layered ocean, beach, and raised green terrain shaped like the Sui droplet.
- Keep the existing repository buildings and Builder HQ as the main city, then add lightweight decorative city clusters in other parts of the island.
- Add tropical details including palms, rocks, coves, shallow water rings, paths, and a small lagoon while keeping the cream, ink, red, and cyan Blast Build identity.
- Rework roads and scenery to fit inside the island silhouette instead of crossing a rectangular platform.
- Keep building selection, owner/repository labels, level filters, rotate/zoom controls, and the helicopter/isometric camera views unchanged.
- Rename the viewer status to “BLAST ISLAND” so the new map is immediately identifiable.

## Technical details
- Build the island with deterministic local Three.js geometry; no remote assets or runtime downloads.
- Use a custom extruded droplet shape with layered rock, sand, and grass meshes so the Sui silhouette remains recognizable from above.
- Use low-poly, repeated geometry for palms and satellite cities and stay within the existing mobile rendering budget.
- Keep all interactive buildings in their current data flow; decorative districts will not impersonate repositories or affect scores.

## Verification
- Check `/build` and a public builder city on desktop and mobile.
- Confirm helicopter view clearly shows the Sui-shaped island and multiple city clusters.
- Confirm orbit, zoom, reset, level filters, building selection, and owner details still work.
- Confirm the scene is lit and nonblank with no overflow, missing assets, or browser errors.
