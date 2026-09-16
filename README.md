# GGE HELPER

Rift Event tracker with a public shared alliance roster and a private admin view.

## Run locally

```bash
npm install
npm run dev
```

The app loads the latest boss records and English names from the public
`ggempire-data-cache` repository. Rift stage progress stays in each browser.
The alliance roster is shared through Supabase and updates live for all visitors.

## Alliance roster

Visitors can see the roster from the **Alliance roster** tab but cannot change
it. An authenticated administrator can open `/GGE-Helper/admin`, import a CSV,
and update attack status. The first CSV column is the member name and the second
can be `true`, `yes`, `1`, or `attacked`. For example:

```csv
name,attacked
Player One,false
Player Two,true
```

## Supabase setup

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. In **Authentication > Users**, create the administrator account.
3. Run the final commented `insert` statement in `supabase/schema.sql` with the
	administrator email.
4. Disable public user signups in **Authentication > Providers > Email**.
5. For local development, create `.env.local` with `VITE_SUPABASE_URL` and
	`VITE_SUPABASE_ANON_KEY` from **Project Settings > API**.

The anon key is designed to be public. Security is enforced by the Row Level
Security policies in `supabase/schema.sql`; never expose the service-role key.

## GitHub Pages

The included workflow deploys the `main` branch to GitHub Pages. In the
repository settings, set Pages to **GitHub Actions**. The Vite base path is
configured for a repository named `GGE-Helper`. Add repository variables named
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Settings > Secrets and
variables > Actions > Variables** before deploying. The workflow includes a SPA
fallback so direct visits to `/GGE-Helper/admin` work.