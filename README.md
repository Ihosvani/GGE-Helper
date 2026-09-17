# GGE HELPER

Rift Event tracker with a public shared alliance roster and an admin view.

## Run locally

```bash
npm install
npm run dev:api
npm run dev
```

Copy `.env.example` to `.env`, export its values in the API terminal, and replace
the example key with a long random secret. Vite proxies local `/api` requests to
the API on port 3001.

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

The app uses one page for boss selection, level selection, the member roster,
and the attack plan. Each boss and level combination has an independent attacked
list. Switching either selector shows that target's saved status.

The `/GGE-Helper/admin` page opens directly and requires no token. Click a
member to change their status; drag members or use the arrow buttons to reorder
them. Admin edits for every boss/level remain in one browser draft. Use
**Download JSON**, replace `src/data/roster.json` with that file in the workspace,
and push `main`. Public clients read the published file every 15 seconds.

## Alliance API

The Node server receives an alliance snapshot at `POST /api/alliance`. Writes
require `Authorization: Bearer <ALLIANCE_API_KEY>`. `GET /api/alliance` returns
the latest snapshot and `GET /api/health` provides a health check.

```bash
curl -X POST http://localhost:3001/api/alliance \
	-H "Authorization: Bearer $ALLIANCE_API_KEY" \
	-H "Content-Type: application/json" \
	-d '{
		"members": ["Alice", "Bob"],
		"attacks": [
			{
				"member": "Alice",
				"target": "rift-12",
				"timestamp": "2026-09-17T12:30:00Z"
			}
		]
	}'
```

Every attack must reference a member in the same request and have a valid ISO
8601 timestamp. `target` is optional. Data is written to `data/alliance.json` by
default; set `ALLIANCE_DATA_FILE` to use another persistent location.

GitHub Pages only hosts static files and cannot run this API. Deploy `npm start`
to a Node-capable service with persistent storage and set `ALLIANCE_API_KEY` in
that service's environment. Do not expose the key in browser code.

## GitHub Pages

The included workflow deploys the `main` branch to GitHub Pages. In the
repository settings, set Pages to **GitHub Actions**. The Vite base path is
configured for a repository named `GGE-Helper`. The workflow includes a SPA
fallback so direct visits to `/GGE-Helper/admin` work.