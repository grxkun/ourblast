# Interactive Blast Island Builder Atlas

## Goal
Turn the public Sui Builder Map into Blast Island, where each visible city dot represents one developer and selecting it reveals that builder's city identity.

## What will change
- Replace the current block grid in the public builder atlas with a tropical Sui-droplet island map.
- Place up to 24 developer city dots deterministically across the island, sized by city level.
- Make each dot selectable and show the developer, city level, tier, verified project count, and rank value in an island detail panel.
- Add a clear action from the selected dot to open that developer's existing full 3D Builder City.
- Keep the leaderboard, rankings, builder records, and individual 3D cities unchanged.

## Technical details
- Implement the atlas as accessible React/CSS UI, avoiding a second WebGL canvas on the rankings page.
- Use stable percentage coordinates so markers remain aligned on desktop and mobile.
- Support keyboard selection, visible focus states, and horizontal-overflow-safe mobile sizing.

## Verification
- Test selecting several developer dots and opening their public city pages.
- Verify desktop and mobile layouts, keyboard access, no overflow, and no browser errors.
