# WatchList — Movie & TV Show Discovery Platform

A modern web application for discovering movies and TV shows, powered by [The Movie Database (TMDb) API](https://www.themoviedb.org/).

Live at **[watch-list.me](https://www.watch-list.me)**

It is a **static site**. `next build` writes plain HTML, CSS and JS to `out/`;
every page renders a Client Component that talks to TMDb from the browser, and
nothing runs on a server at request time. See [Architecture](#architecture).

## Features

- **Browse & Discover** — Trending content, now playing in theaters, popular and top-rated movies and TV shows
- **Detail pages** — Full info for movies, TV shows, and people: cast, crew, trailers, gallery, reviews, seasons, similar content, streaming providers, ratings and Wikipedia insights
- **People pages** — Actor/director filmographies with movie and TV credits
- **Collection pages** — Movie collection groupings (e.g. film series)
- **Personal Watchlist** — Add/remove titles, persisted in browser storage; real-time counter in navigation
- **Watchlist sorting, filtering & grouping** — Sort by date added, title, rating or release; filter by media type or title search; or group the whole list by where each title can be watched right now ("ready on your platforms", "rent or buy only", "not streaming in your region")
- **Episode tracking** — Tick individual episodes or a whole aired season; per-season progress bars and a "Continue Watching" row on the home page that offers the next unwatched episode of every series in progress
- **Release calendar** — Upcoming episode air dates and film release dates for everything you follow, using regional cinema dates where available, grouped by planning horizon, with an `.ics` export into your own calendar app
- **What to watch tonight** — One pick off your own list, filtered by the time you actually have, whether it is streaming on your platforms right now, and the mood you are in. A grid is what you were already stuck in
- **Browse by mood** — Curated pages for the way people really choose: something easy, something mind-bending, something under ninety minutes, lights off
- **Rank your watchlist** — Pairwise duels ("which of these two?") folded into an Elo rating, ending in a personal top ten that shares as a link
- **Compare two lists** — Paste a friend's share link and see what you have both already saved. Both lists live in the URL, so the overlap needs no accounts on either side
- **Named lists** — Lists of your own beyond the watchlist ("October horror", "films to show my dad"), each shareable as a link
- **Your stats** — Hours watched, top genres, decades you live in, a histogram of your own scores, achievements, a yearly target and a year in review worth sharing
- **Profiles** — More than one person per browser, with separate watchlists, ticks, ratings, streaks and "since you were last here" (see [how personal data is stored](#how-personal-data-is-stored))
- **Puzzle archive & a second game** — Every daily puzzle that has run is still playable, with a streak calendar and badges; plus "higher or lower", an endless run on TMDb ratings
- **Since you were last here** — The home page opens with what aired while you were away, rather than looking identical to the last visit. Each profile has its own last visit, so someone who follows nothing cannot acknowledge another person's interval. Every followed title is checked in bounded batches before the visit is acknowledged. Unreadable saved titles or a failed or cancelled check keep the previous interval available for retry, including after the connection returns
- **Offline & installable** — A service worker keeps the app usable with no connection, or one too slow to answer: pages visited before load from cache and fill themselves in from browser storage, and the app's own assets and posters are served from cache
- **Your own ratings** — Score anything out of ten; rating a title marks it watched. Highly rated titles pull harder on your recommendations and poorly rated ones stop feeding them altogether
- **Backup & transfer** — Download everything this browser holds as a JSON file and restore it anywhere — every profile, not just the one you are switched into, with ratings, named lists, ranking, goal, streaks, last visits and settings included. Anything the browser cannot read is named after the download, and its stored text is kept in the file for recovery rather than stopping the backup; a restore never writes it back. There is no account, so this is the only copy that exists, and the app says so once your list is big enough to be worth losing
- **Shareable lists** — Turn a list into a link that carries the titles in the URL itself. Nothing is stored anywhere; the recipient saves the whole list in one click
- **Daily film puzzle** — Guess the film from a blurred still. One puzzle a day, the same for everybody, six guesses, a clue per wrong one (the fifth miss hands over the last two together, so every clue arrives before the final guess), and a streak. On the honour system: with no server, the answer is readable by anyone who opens devtools
- **Advanced Filtering & Sorting** — Genre, release year, rating, language, vote count, streaming provider, custom date ranges, multiple sort criteria
- **Regional streaming info** — Where to watch per country (200+ regions supported), including subscription, free and ad-supported services, with deep-links to provider apps
- **Genre browsing** — Browse movies and TV shows by genre with pagination
- **Search** — Instant preview in the header plus a real `/search?q=` page, paginated with linkable URLs, reachable with `/` or ⌘K (Ctrl+K on Windows/Linux) from anywhere outside a text field
- **Metadata** — Structured data (JSON-LD), sitemap, robots.txt, OpenGraph/Twitter cards
- **PWA** — App manifest for mobile installation

## Tech Stack

|           |                                     |
| --------- | ----------------------------------- |
| Framework | Next.js 16 (App Router, Webpack builds, Turbopack dev, `output: "export"`) |
| Language  | TypeScript 6                        |
| UI        | React 19, Tailwind CSS 4            |
| Icons     | Lucide React                        |
| API       | TMDb REST API, Wikipedia and Wikidata Action APIs |

## Getting Started

### Prerequisites

- Node.js 22.12+, 24, or 26+ — the range `package.json` declares. Next itself
  asks only for 20, but Vitest 5 does not run on it at all, so a checkout on 20
  builds and then fails `npm test` with a message about nothing in particular.
  CI runs 26, which is what the lockfile was resolved under.
- TMDb API Bearer token ([how to get one](https://developer.themoviedb.org/docs/getting-started))

### Installation

```bash
git clone https://github.com/RobertLib/watch-list.git
cd watch-list
npm install
```

Copy the template and fill in the token:

```bash
cp .env.example .env
```

```env
NEXT_PUBLIC_TMDB_API_TOKEN=your_tmdb_bearer_token_here
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_GA_MEASUREMENT_ID=
```

The token is prefixed `NEXT_PUBLIC_` because it is compiled into the JavaScript
bundle and used from the browser. It is a read-only key for a public catalogue,
and hiding it is the one thing a server was doing here.

`NEXT_PUBLIC_BASE_URL` is the origin the site advertises in the places a link has
to be absolute — canonical tags, JSON-LD, the sitemap, share text and the `.ics`
export. It is optional: leaving it unset falls back to the production origin. Set
it on a preview deployment so a staging build does not claim to be production.
Everything reads it through `SITE_URL` in `src/lib/routes.ts`.

`NEXT_PUBLIC_GA_MEASUREMENT_ID` is optional. Leave it unset — as `.env.example`
does — and no analytics script is rendered at all, which is what a fork or a
local checkout wants.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available Scripts

```bash
npm run dev        # Development server (Turbopack)
npm run build      # Production static export to out/ (Webpack), with pre- and postbuild steps
npm run start      # Serve the built out/ locally, configured to answer like GitHub Pages
npm run lint       # ESLint
npm run test       # Vitest
npm run test:watch # Vitest, watching
```

Production builds use Next's supported Webpack mode. Turbopack's CSS compilation
can fail in restricted build environments when its worker cannot bind a local
port; `npm run build` avoids that requirement and produces the static `out/`
export. The same script runs in CI.

`npm run build` runs `scripts/prebuild.mjs` first: it empties Next's fetch cache
(so the TMDb snapshots are taken fresh) and, with a token, picks the titles to
prerender into `.next/cache/prerendered-titles.json`. Without a token it
prerenders none, and the build still succeeds. `scripts/postbuild.mjs` then fails
the build if `out/` has grown close to GitHub Pages' 1 GB limit. `next dev` reads
the list the last build left behind, so title paths work in development only
after a `npm run build`.

`npm run start` is a local preview of `out/`, not a production server — it runs
`serve`, which is a dev dependency. There is no production Node process to start:
a deploy is the contents of `out/` on GitHub Pages (see [Deployment](#deployment)).

The preview reads `serve.json` from the repository root. It is passed as
`--config ../serve.json` because `serve` resolves that path from the directory it
serves, and a config kept inside `out/` would be published with the site. It makes
the preview answer the way Pages does where it matters: `/movie` serves
`movie.html`, a path with no file gets `404.html` with a 404 status (which is
where the old `/movie/<slug>` URLs are redirected — see
[Architecture](#architecture)), and a directory is never listed. Without it,
`serve` answered `/movie/` with `movie.html`, a URL that is a 404 in production.
What still differs:

- A trailing slash redirects to the path without it, and the redirect drops the
  query string; Pages answers `/movie/` and `/movie/?id=550` with a 404. A
  trailing-slash link that works in the preview is still a broken link.
- `/movie.html` redirects to `/movie`; Pages serves it as it is.
- Pages sends `Cache-Control: max-age=600` with every file, so a deploy can take
  ten minutes to reach a browser that just loaded the page; the preview sends no
  caching headers, so a rebuild shows on the next reload. The service worker's
  own update check bypasses that cache in both.
- The preview is plain HTTP on `localhost` rather than HTTPS. Browsers allow a
  service worker there, so offline behaviour can be checked in the preview; it
  is also where the Content Security Policy is enforced outside production,
  since `next dev` runs without it.

The overrides require patched `compression` (1.8.2+) for the local preview and
`source-map-js` (1.2.2+) for the build and test toolchain. `sharp` (0.35.5+)
includes the patched librsvg dependency for GHSA-wq5f-xc86-pv6w, and
`minimatch` (11.0.1+) under `@typescript-eslint/typescript-estree` closes
GHSA-g3hv-75wg-m249, which that package's own `^10` range cannot reach. With
them `npm audit` reports nothing; drop each one once its parent's own range
admits the fix.

## Deployment

`.github/workflows/ci.yml` runs lint, the typecheck, the test suite in three
timezones and the build on every push and pull request to `main`. When it passes
on a push to `main`, `.github/workflows/deploy.yml` builds `out/` again with the
production settings and publishes it to GitHub Pages at
[www.watch-list.me](https://www.watch-list.me), the custom domain set in the
repository's Pages settings.

- **Only the tip of `main` deploys.** Re-running an old CI run completes CI again
  for that old commit. The deploy checks whether the commit is still what `main`
  points at and skips it if not, rather than silently rolling the site back; the
  newer commit deploys when its own CI passes. Running the workflow by hand
  (`workflow_dispatch`) deploys whatever it is run on — after rotating the token,
  say.
- **No token, no deploy.** The `NEXT_PUBLIC_TMDB_API_TOKEN` repository secret is
  compiled into the bundle, and a build without it would publish a site that
  answers 401 to everything — so the job fails before building instead. The
  build reads TMDb with it too, for the snapshots it prerenders (see
  [SEO](#seo)); a TMDb failure while taking them fails the build, and the
  deployment already live stays up.
  `NEXT_PUBLIC_GA_MEASUREMENT_ID` is an optional repository variable.
- **A daily rebuild keeps the snapshots current.** The workflow also runs on a
  schedule (04:17 UTC) and rebuilds whatever `main` points at — but only once a
  CI run on a push of exactly that commit has succeeded, so a commit whose CI
  failed never reaches the site that way. GitHub pauses schedules in a
  repository with no activity for sixty days; a push or a manual run resumes
  them.
- **Only the publishing job can publish.** `pages: write` and `id-token: write`
  belong to the deploy job alone; the build job, which runs `npm ci` and with it
  every dependency's install scripts, can only read the repository.

## Architecture

The app used to render on a server: pages were Server Components, the TMDb token
lived in a server-only module, and the region and platform settings were httpOnly
cookies the browser could not read. That bought SEO on the detail pages and a
shared cache — and it meant every crawl of a title cost a function invocation.

It is now a static export, and the shape of everything follows from that:

- **Every page is a thin Server Component around a Client Component.** The page
  file exists to declare `metadata` — a title, a description, a canonical, a
  robots directive — because those are resolved at build time and cannot come
  from a Client Component. The body it renders is the client half, which fetches
  in effects (`useAsyncData`) rather than awaiting in the component body. For
  most pages the built HTML is a shell with skeletons in it, but a shell with the
  right `<head>`; the genre, mood and home pages carry a build-time snapshot of
  their listings instead (see [SEO](#seo)).
- **The TMDb read token ships in the bundle** as `NEXT_PUBLIC_TMDB_API_TOKEN`.
  Requests go from the browser straight to `api.themoviedb.org`.
- **Most titles are addressed by query string**, because a static export can
  only serve paths that existed at build time and there is no build-time list
  of TMDb's whole catalogue: `/movie?id=…` is one page that renders any film.
  What the build *can* list has paths of its own, generated by
  `generateStaticParams`: every genre (`/genres/movie/action-28`), every genre
  on each landing platform (`/genres/movie/action-28/netflix`), every mood
  (`/mood/easy-watch`), and the best-known films, series and people
  (`/movie/fight-club-550`, `/tv/breaking-bad-1396`, `/person/tom-hanks-31`),
  which `scripts/prebuild.mjs` picks before each build. Every link is built
  through `src/lib/routes.ts`, so those choices live in one file — a title link
  points at the path when the build wrote one, and at `?id=` otherwise. The query forms genres
  and moods had before (`/genres/movie?genre=…`, `/mood?id=…`) move the visitor
  to the path (`src/components/LegacyQueryRedirect.tsx`). The path forms the
  server-rendered site published — titles, people, collections, genres and a few
  listing pages — are answered by Pages with `404.html` when no such file exists,
  which sends a visitor on to the page that replaced them
  (`src/components/LegacyPathRedirect.tsx`).
  Search engines do not follow that: it runs in the browser, on a 404. The old
  site wrote slugs id-first and later title-first, so a slug with a number at
  both ends (`1263256-happy-gilmore-2`, `1917-530915`) reads either way; for that
  shape alone the redirect asks TMDb what the leading number names and keeps the
  id-first reading only when the rest of the slug is that title.
- **Settings live in `localStorage`**, behind a small store (`src/lib/settings.ts`)
  that `tmdbApi` can read synchronously and that components subscribe to through
  `useSettings()`. Changing region or platforms re-runs every listing.
- **There are no API routes and no Server Actions.** What they did is now plain
  async functions in `src/lib/api.ts`, with the same names and signatures.
- **The Content Security Policy is a `<meta>` tag** in `src/app/layout.tsx`,
  because Pages cannot send response headers. It has to allow inline scripts —
  the export writes them into every page and there is no server to mint nonces —
  but it pins every other origin: TMDb's API and images, Wikipedia and Wikidata,
  YouTube's thumbnails and player, and Google Analytics when it is configured.
  A new origin goes into that list in the same change, or production blocks it.
- **Metadata is built, not patched in.** `src/app/layout.tsx` holds what the whole
  site shares; each route adds its own through `pageMetadata` in
  `src/lib/page-metadata.ts`, and a prerendered title through
  `src/lib/title-metadata.ts`, with its own summary and picture. The pages
  addressed by query string are the exception — the build cannot know which
  film `?id=` names, so those set their title and canonical from
  `useDocumentTitle` and `useCanonicalUrl` once the browser knows, and carry
  `noindex` in the served HTML so the generic shell never ranks in place of the
  real thing.

What the migration cost, in full:

- **The subscribable calendar feed is gone.** `webcal://` needs a URL a server
  answers on the calendar app's schedule. The `.ics` download next to it is
  unaffected — it is built in the browser.
- **The daily puzzle is on the honour system.** The film pool ships to the
  client and the schedule is a pure function of the date. The pool only grows
  at the end, and each growth adds a `PUZZLE_POOL_GENERATIONS` entry dated a few
  days ahead (`src/lib/daily-puzzle-pool.ts`), so no day that has already run
  changes its answer – the tests refuse a pool that grew without one.
- **SEO on detail pages is partial.** About 1,200 of the best-known films,
  series and people are prerendered with their content (see [SEO](#seo)); every
  other title is an empty shell until JavaScript runs, and is `noindex`.

### How personal data is stored

Profile data stays at stable storage addresses; switching changes only the shared active-profile pointer. Profile operations, edits to personal data and settings, and backup restores share a browser lock. Each read-modify-write reads the latest data after acquiring the lock, so changes in different tabs preserve one another. Backup export holds the same lock while reading its complete snapshot; only an unreadable roster, active pointer or owner marker stops it. Actions wait for storage before reporting success; legacy cookie migration uses the same lock. Saving a shared list or marking and rating a title keeps its related edits together under that lock. Writes belong to the profile whose data was rendered, even if another tab switches before its storage event arrives. Deleted profiles reject late writes, and obsolete active-profile pointers resolve to the default profile. Existing live keys retain their original owner through an immutable marker, and older parked profile data remains readable until individual stores are edited. Each edit or clear replaces its readable older field in the same storage transaction, releasing space before saving the current value and preserving unrelated stores. A refused write attempts to restore the exact previous values; if the browser also refuses recovery, readers refresh from actual storage. Unreadable older copies remain available for recovery. Switching to a profile never reads its stores, so an unreadable one behaves as it would for the active profile: it renders empty, refuses edits, and can be cleared.
Profile deletion commits one persistent deletion marker before cleaning up its roster entry or stored data. If the browser refuses that marker, the profile and its data remain included in backups. Once the marker is saved, readers treat the deletion as complete even if cleanup fails; stale tabs cannot revive the removed profile.

Personal-data edits require a successful read of the current store before deriving the new value. A refused read aborts the edit and leaves the saved history intact; empty fallbacks used for rendering are never saved as though they were the current data. Clearing a store derives nothing from it, so an explicit clear succeeds even over unreadable data.

When Web Locks are unavailable, including on non-localhost HTTP, IndexedDB transactions provide storage coordination. Tabs with Web Locks take this shared gate too, so both paths coordinate. The coordination database stores no personal data; a refused lock or transaction prevents the edit. When IndexedDB is absent, native Web Locks alone still coordinate the operations.

## SEO

The site is a static export, and every choice below follows from what that
allows: a page a search engine can index is a page the build wrote out as its
own HTML file, with its content in it.

- **Indexable pages carry their content in the HTML.** The genre pages, the
  genre-on-a-platform landings, the mood pages and the home page are rendered at
  build time with a snapshot of their listing — page one, for the default region
  (US) and no filters — taken from TMDb by `src/lib/build-time-tmdb.ts`; so do
  the fixed sections of `/movies` and `/tv-shows`, and `/people`. A
  crawler reads titles, headings and links there, not skeletons. In the browser
  the same snapshot is what the page starts from (`useAsyncData`'s
  placeholder), and the visitor's own region replaces it once it loads. The
  deploy workflow rebuilds daily so the snapshots stay current.
- **The best-known titles are pages of their own.** Before each build,
  `scripts/prebuild.mjs` picks about 650 films and 325 series (the most-voted,
  plus this month's popular releases with a vote floor) and 250 people (popular,
  and known for something widely seen). Each is prerendered at
  `/movie/<slug>`, `/tv/<slug>` or `/person/<slug>` with its details in the
  HTML: heading, summary, cast and crew, similar titles, JSON-LD, a title like
  "Fight Club (1999) – Where to Watch", and its backdrop as the social card. The
  snapshot is cut to what the first render shows (`src/lib/title-details.ts`):
  a page carries it four times on disk, and a Pages site may be at most 1 GB.
  The list ships in the bundle as compact ids (`src/lib/prerendered-titles.ts`),
  so every title link — in the HTML and in the browser alike — points at the
  path when the page exists and at `?id=` when it does not. A path the build did
  not write (a renamed title, an old id-first slug) is a 404 that sends the
  visitor to `?id=`, never to another path.
- **Prerendered pages hydrate without mismatches.** What they render cannot
  depend on the visitor: numbers and dates are formatted in `en-US` and UTC, a
  living person's age waits for the browser's own day, and a visitor outside
  the US sees no "where to watch" until their region's providers load, rather
  than the build's.
- **Every indexable page has a path of its own and a canonical.** Query-string
  variants of it — filters, a later page — serve the same HTML, so they
  canonicalise to the path.
- **Thin pages stay out.** A landing with fewer than
  `MIN_INDEXABLE_LANDING_RESULTS` titles (counted at build time) is `noindex`
  and left out of the sitemap; the visitor who follows a link to it still gets
  the page.
- **The sitemap lists exactly the indexable pages**, and its test fails if a
  listed route declares `noindex`.
- **Personal pages and query-addressed title pages are `noindex, follow`**,
  never `Disallow`ed: a page a crawler cannot fetch is a page whose `noindex`
  it never reads.
- **Structured data stays inside Google's guidelines.** There is no
  `aggregateRating`: the only score available is TMDb's, and the guidelines
  forbid marking up ratings aggregated from another site.

## Project Structure

```
src/
├── app/                     # Server Components: metadata + the client half
│   ├── about/               # About page
│   ├── calendar/            # Release calendar
│   ├── collection/          # A film series          — ?id=
│   ├── daily/               # Daily film puzzle      — ?day= for the archive
│   │   ├── archive/         # Every puzzle that has run
│   │   └── higher-lower/    # Endless rating game
│   ├── genres/              # Genre index
│   │   ├── movie/           # Old ?genre= addresses, redirected to the paths below
│   │   │   └── [genre]/     # Films in one genre, prerendered per genre
│   │   │       └── [platform]/ # …on one streaming platform
│   │   └── tv/              # The same for series
│   ├── list/                # A shared list          — ?items= &t=
│   ├── lists/               # Your own named lists
│   ├── match/               # Compare two lists      — ?mine= &theirs=
│   ├── mood/                # Old ?id= addresses, redirected to [slug]
│   │   └── [slug]/          # One curated mood, prerendered per mood
│   ├── moods/               # The mood picker
│   ├── movie/               # Film detail            — ?id=
│   │   └── [slug]/          # …prerendered, for the best-known films
│   ├── movies/              # Films listing with filtering
│   ├── offline/             # Served by the service worker with no connection
│   ├── people/              # People listing
│   ├── person/              # Person detail          — ?id=
│   │   └── [slug]/          # …prerendered, for the best-known people
│   ├── profile/             # Settings & backup
│   ├── ratings/             # What you scored
│   ├── search/              # Search results         — ?q= &page=
│   ├── stats/               # Your watching stats
│   ├── tonight/             # What to watch tonight
│   ├── tv/                  # Series detail          — ?id=
│   │   └── [slug]/          # …prerendered, for the best-known series
│   ├── tv-shows/            # Series listing with filtering
│   └── watchlist/           # Personal watchlist
│       └── ranking/         # Pairwise ranking of the watchlist
├── components/
│   ├── carousels/           # Home-page rows, one file
│   ├── movie/               # Movie-specific components
│   ├── person/              # Person-specific components
│   ├── skeletons/           # Loading skeletons, shared by pages and loading.tsx
│   └── tv/                  # TV-specific components
├── contexts/                # Watchlist, watched, episode progress, genres
├── hooks/
│   ├── useAsyncData.ts      # Load-on-mount with cancellation — the shape every page uses
│   ├── useSettings.ts       # Region & platforms as React state
│   ├── useDocumentTitle.ts  # Tab titles for the pages the build cannot name (?id=)
│   ├── useCanonicalUrl.ts   # Their canonical link, for the same reason
│   └── useHydrated.ts       # For the few things that must wait for browser storage
├── lib/
│   ├── api.ts               # What app/actions.ts used to be, as plain functions
│   ├── routes.ts            # Every internal link, in one place
│   ├── build-time-tmdb.ts   # The TMDb snapshots the build writes into pages
│   ├── title-details.ts     # What a title page loads, and the cut-down snapshot of it
│   ├── title-metadata.ts    # A prerendered title's <head>: title, summary, social card
│   ├── prerendered-titles*.ts # Which titles have a page of their own
│   ├── genre-catalog.ts     # Every TMDb genre, so the build can list their pages
│   ├── streaming-landing.ts # The platforms with genre landings, and when one is indexable
│   ├── page-metadata.ts     # Per-page metadata: canonical, robots, social cards
│   ├── settings.ts          # Region & platforms in localStorage, with a store
│   ├── tmdb.ts              # TMDb client (details, credits, search, people)
│   ├── tmdb-discover.ts     # Discovery listings, filtered by region & platforms
│   ├── tmdb-cache.ts        # Transport: token, TTL cache, rate limit
│   ├── fetch-with-retry.ts  # Timeout and retry for every request leaving the origin
│   ├── streaming-providers.ts # Platforms a region offers
│   ├── title-providers.ts   # Where one title streams, for the card overlay
│   ├── episode-progress.ts  # Per-episode watched state (localStorage)
│   ├── ratings.ts           # The viewer's own scores (localStorage)
│   ├── continue-watching*.ts # Resolves the next unwatched aired episode per show
│   ├── release-calendar*.ts # Upcoming air dates & film releases for followed titles
│   ├── calendar-ics.ts      # iCalendar (.ics) export, with alarms
│   ├── daily-puzzle*.ts     # Daily puzzle rules, film pool and answer resolution
│   ├── daily-game.ts        # Board, streak, history and archive (localStorage)
│   ├── daily-badges.ts      # Badges, derived from the game state
│   ├── rating-duel-data.ts  # "Higher or lower"
│   ├── higher-lower.ts      # That game's personal best (localStorage)
│   ├── tonight*.ts          # The shortlist for tonight and the rules that narrow it
│   ├── moods.ts             # Curated TMDB queries behind the mood pages
│   ├── ranking.ts           # Elo over pairwise choices (localStorage)
│   ├── collections.ts       # Named lists (localStorage)
│   ├── profiles.ts          # More than one person per browser
│   ├── stats*.ts            # Watching totals, and the TMDB facts behind them
│   ├── achievements.ts      # Achievements, derived from the stats
│   ├── goal.ts              # A yearly target and how it is tracking
│   ├── list-match.ts        # The overlap between two shared lists
│   ├── last-visit.ts        # When each profile was last here
│   ├── since-last-visit-data.ts # What came out while it was away
│   ├── watchlist-view.ts    # Watchlist sorting, filtering and availability grouping
│   ├── watchlist-availability.ts # Where every saved title streams
│   ├── portable-data.ts     # Backup/restore format and its validation
│   ├── shared-list*.ts      # Encoding a list into a URL and resolving it back
│   ├── wikipedia.ts         # Wikipedia/Wikidata Action API client (CORS-enabled)
│   ├── region*.ts           # Region validation and data
│   ├── provider-urls.ts     # Streaming provider deep-link URL builders
│   └── utils.ts             # Slug generation and other utilities
└── types/                   # TypeScript type definitions (tmdb, filters)
scripts/
├── prebuild.mjs             # Fresh fetch cache; picks the titles to prerender
└── postbuild.mjs            # Fails the build when out/ nears Pages' 1 GB
```

The `hooks/` and `lib/` listings name the files worth knowing first, not every
file in them.

## Caching

There is no server cache any more, so all of it is in the tab:

- **TMDb responses** — in memory, keyed by URL (`src/lib/tmdb-cache.ts`), with
  per-endpoint TTLs: an hour for trending, two for watch providers, six for
  details, a day for genre lists. It also de-duplicates concurrent requests, so
  the hero and the trending row cost one call between them. Interactive reads
  (listings, detail pages, searches) and background loaders (Tonight,
  statistics, calendar, Continue Watching, recommendations, rated titles, shared
  lists) have separate budgets – 300 least-recently-used entries and 1,500
  entries – so a long Tonight or statistics walk cannot evict the listings you go
  back to, and a walk bigger than its budget keeps the same leading part cached
  and refetches only the rest. Watch-provider answers are kept for the requested
  region only. Airing-today results
  expire by local midnight, and open pages refresh when the day changes.
- **Request rate** — at most eight TMDb requests in flight at once, so a
  watchlist of two hundred titles does not arrive as two hundred parallel calls.
  Interactive requests take priority over queued recommendations, statistics,
  calendar, Tonight, watchlist availability, Continue Watching, since-last-visit,
  rated-title, shared-list and list-comparison lookups. Leaving
  a page cancels its work while preserving requests still needed by another caller.
- **Service worker** (`public/sw.js`) — the build's own hashed JS and CSS and
  TMDb posters, cache-first: each is immutable at its URL, so a stale entry is
  unreachable rather than wrong. Pages are cached too, network-first: whenever
  the network answers within four seconds the visitor gets its markup, which is
  what keeps caching the hashed assets safe — that markup names this
  deployment's files. The cached copy, keyed by path without the query string,
  is the fallback for no connection and for a connection too slow to answer in
  time, with `/offline` behind it for a page never saved; an answer that arrives
  late still replaces the copy for next time. Navigation preload starts each
  page's request while the worker is still starting up.
  A copy may be a deployment behind, naming chunks the host no longer serves, so
  the static cache (150 entries — a build is about 90 files) gives up first what
  no saved page or payload names, least recently used first, and touches the
  chunks a saved page needs only when that is not enough, oldest page first.
  Posters go least recently used first, so the watchlist's own outlast a
  browsing session.
  The worker registers once the page has loaded and the browser is idle; the app
  then saves the current page's HTML and assets, and does the same after every
  client-side navigation, so visiting a page through the menu makes it available
  offline. A page saved within the last day is not fetched again for that: the
  copy a full load or a Link transition has just stored is already current, and
  fetching it again would spend the visitor's data and the host's bandwidth on an
  identical file. Static React Server Component payloads use the same
  network-first policy, timeout included, allowing previously visited routes to
  load through internal links offline. TMDb responses are never cached: a
  stale-response cache is the classic way a service worker turns into a bug
  report.
- **The CDN** — every route is a static file, so it is cached at the edge and a
  crawl costs no compute at all. That was the point of the exercise.

## License

MIT — see [LICENSE](LICENSE).

## Author

**Robert Libsansky**

---

> This product uses the TMDb API but is not endorsed or certified by TMDb.
