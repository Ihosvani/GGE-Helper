# GGE HELPER

Rift Event tracker with a public shared alliance roster and an admin view.

## Run locally

```bash
npm install
npm run dev
```

The app loads the latest boss records and English names from the public
`ggempire-data-cache` repository. Rift stage progress stays in each browser.
The alliance roster is stored in this repository and refreshes every 15 seconds.

## Alliance roster

Visitors can see the roster from the **Alliance roster** tab but cannot change
it. Open `/GGE-Helper/admin` to import the original alliance JSON or a CSV and
update attack status. The first CSV column is the member name and the second can
be `true`, `yes`, `1`, or `attacked`. For example:

```csv
name,attacked
Player One,false
Player Two,true
```

## Admin roster

The `/GGE-Helper/admin` page opens directly and requires no token. To change a
member's status, click their row; drag members or use the arrow buttons to
reorder them. Admin edits remain as a browser draft. Use **Download JSON**,
replace `src/data/roster.json` with that file in the workspace, and push `main`.
Public clients read the published file from GitHub every 15 seconds.

## GitHub Pages

The included workflow deploys the `main` branch to GitHub Pages. In the
repository settings, set Pages to **GitHub Actions**. The Vite base path is
configured for a repository named `GGE-Helper`. The workflow includes a SPA
fallback so direct visits to `/GGE-Helper/admin` work.