# WatchList — Movie & TV Show Discovery Platform

A modern web application for discovering movies and TV shows, powered by [The Movie Database (TMDb) API](https://www.themoviedb.org/).

Live at **[watch-list.me](https://www.watch-list.me)**

It is a **static site**. `next build` writes plain HTML, CSS and JS to `out/`;
every page is a Client Component that talks to TMDb from the browser, and nothing
runs on a server at request time. See [Architecture](#architecture).

## Features

- **Browse & Discover** — Trending content, now playing in theaters, popular and top-rated movies and TV shows
- **Detail pages** — Full info for movies, TV shows, and people: cast, crew, trailers, gallery, reviews, seasons, similar content, streaming providers, ratings and Wikipedia insights
- **People pages** — Actor/director filmographies with movie and TV credits
- **Collection pages** — Movie collection groupings (e.g. film series)
- **Personal Watchlist** — Add/remove titles, persisted in browser storage; real-time counter in navigation
- **Watchlist sorting, filtering & grouping** — Sort by date added, title, rating or release; filter by media type or title search; or group the whole list by where each title can be watched right now ("ready on your platforms", "rent or buy only", "not streaming in your region")
- **Episode tracking** — Tick individual episodes or a whole aired season; per-season progress bars and a "Continue Watching" row on the home page that offers the next unwatched episode of every series in progress
- **Release calendar** — Upcoming episode air dates and cinema releases for everything you follow, grouped by planning horizon, with an `.ics` export into your own calendar app
- **What to watch tonight** — One pick off your own list, filtered by the time you actually have, whether it is streaming on your platforms right now, and the mood you are in. A grid is what you were already stuck in
- **Browse by mood** — Curated pages for the way people really choose: something easy, something mind-bending, something under ninety minutes, lights off
- **Rank your watchlist** — Pairwise duels ("which of these two?") folded into an Elo rating, ending in a personal top ten that shares as a link
- **Compare two lists** — Paste a friend's share link and see what you have both already saved. Both lists live in the URL, so the overlap needs no accounts on either side
- **Named lists** — Lists of your own beyond the watchlist ("October horror", "films to show my dad"), each shareable as a link
- **Your stats** — Hours watched, top genres, decades you live in, a histogram of your own scores, achievements, a yearly target and a year in review worth sharing
- **Profiles** — More than one person per browser, with separate watchlists, ticks, ratings and streaks
- **Puzzle archive & a second game** — Every daily puzzle that has run is still playable, with a streak calendar and badges; plus "higher or lower", an endless run on TMDb ratings
- **Since you were last here** — The home page opens with what aired while you were away, rather than looking identical to the last visit
- **Offline & installable** — A service worker keeps the app openable with no connection, and serves the app's own assets and posters from cache
- **Your own ratings** — Score anything out of ten; rating a title marks it watched. Highly rated titles pull harder on your recommendations and poorly rated ones stop feeding them altogether
- **Backup & transfer** — Download everything this browser holds as a JSON file and restore it anywhere — every profile, not just the one you are switched into, with ratings, named lists, ranking, goal, streaks and settings included. There is no account, so this is the only copy that exists, and the app says so once your list is big enough to be worth losing
- **Shareable lists** — Turn a list into a link that carries the titles in the URL itself. Nothing is stored anywhere; the recipient saves the whole list in one click
- **Daily film puzzle** — Guess the film from a blurred still. One puzzle a day, the same for everybody, six guesses, a clue per wrong one, and a streak. On the honour system: with no server, the answer is readable by anyone who opens devtools
- **Advanced Filtering & Sorting** — Genre, release year, rating, language, vote count, streaming provider, custom date ranges, multiple sort criteria
- **Regional streaming info** — Where to watch per country (200+ regions supported), deep-links to provider apps
- **Genre browsing** — Browse movies and TV shows by genre with pagination
- **Search** — Instant preview in the header plus a real `/search?q=` page, paginated with linkable URLs, reachable with `/` or `Cmd/Ctrl+K` from anywhere
- **Metadata** — Structured data (JSON-LD), sitemap, robots.txt, OpenGraph/Twitter cards
- **PWA** — App manifest for mobile installation

## Tech Stack

|           |                                     |
| --------- | ----------------------------------- |
| Framework | Next.js 16 (App Router, Turbopack, `output: "export"`) |
| Language  | TypeScript 6                        |
| UI        | React 19, Tailwind CSS 4            |
| Icons     | Lucide React                        |
| API       | TMDb REST API, Wikipedia Action API |

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
Everything reads it through `SITE_URL` in `lib/routes.ts`.

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
npm run build      # Static export to out/
npm run start      # Serve the built out/ locally, to check the export itself
npm run lint       # ESLint
npm run test       # Vitest
npm run test:watch # Vitest, watching
```

`npm run start` is a local preview of `out/`, not a production server — it runs
`serve`, which is a dev dependency. There is no production Node process to start:
a deploy is the contents of `out/` on a static host.

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
  in effects (`useAsyncData`) rather than awaiting in the component body. The
  built HTML is a shell with skeletons in it, but a shell with the right `<head>`.
- **The TMDb read token ships in the bundle** as `NEXT_PUBLIC_TMDB_API_TOKEN`.
  Requests go from the browser straight to `api.themoviedb.org`.
- **Anything the catalogue names is addressed by query string**, because a static
  export can only serve paths that existed at build time: `/movie?id=550-fight-club`
  rather than `/movie/550-fight-club`. Every link is built through
  `src/lib/routes.ts`, so that choice lives in one file.
- **Settings live in `localStorage`**, behind a small store (`src/lib/settings.ts`)
  that `tmdbApi` can read synchronously and that components subscribe to through
  `useSettings()`. Changing region or platforms re-runs every listing.
- **There are no API routes and no Server Actions.** What they did is now plain
  async functions in `src/lib/api.ts`, with the same names and signatures.
- **Metadata is built, not patched in.** `app/layout.tsx` holds what the whole
  site shares; each route adds its own through `pageMetadata` in
  `src/lib/page-metadata.ts`. The pages addressed by query string are the
  exception — the build cannot know which film `?id=` names, so those set their
  title and canonical from `useDocumentTitle` and `useCanonicalUrl` once the
  browser knows, and carry `noindex` in the served HTML so the generic shell
  never ranks in place of the real thing.

What the migration cost, in full:

- **The subscribable calendar feed is gone.** `webcal://` needs a URL a server
  answers on the calendar app's schedule. The `.ics` download next to it is
  unaffected — it is built in the browser.
- **The daily puzzle is on the honour system.** The film pool ships to the
  client and the schedule is a pure function of the date.
- **SEO on detail pages is gone.** They are empty shells until JavaScript runs.

## Project Structure

```
src/
├── app/                     # Every page here is "use client"
│   ├── about/               # About page
│   ├── calendar/            # Release calendar
│   ├── collection/          # A film series          — ?id=
│   ├── daily/               # Daily film puzzle      — ?day= for the archive
│   │   ├── archive/         # Every puzzle that has run
│   │   └── higher-lower/    # Endless rating game
│   ├── genres/              # Genre index
│   │   ├── movie/           # Films in one genre     — ?genre= &provider=
│   │   └── tv/              # Series in one genre    — ?genre= &provider=
│   ├── list/                # A shared list          — ?items= &t=
│   ├── lists/               # Your own named lists
│   ├── match/               # Compare two lists      — ?mine= &theirs=
│   ├── mood/                # One curated mood       — ?id=
│   ├── moods/               # The mood picker
│   ├── movie/               # Film detail            — ?id=
│   ├── movies/              # Films listing with filtering
│   ├── offline/             # Served by the service worker with no connection
│   ├── people/              # People listing
│   ├── person/              # Person detail          — ?id=
│   ├── profile/             # Settings & backup
│   ├── ratings/             # What you scored
│   ├── search/              # Search results         — ?q= &page=
│   ├── stats/               # Your watching stats
│   ├── tonight/             # What to watch tonight
│   ├── tv/                  # Series detail          — ?id=
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
│   ├── useDocumentTitle.ts  # Per-page tab titles, since metadata exports are gone
│   └── useHydrated.ts       # For the few things that must wait for browser storage
├── lib/
│   ├── api.ts               # What app/actions.ts used to be, as plain functions
│   ├── routes.ts            # Every internal link, in one place
│   ├── settings.ts          # Region & platforms in localStorage, with a store
│   ├── tmdb.ts              # TMDb client (details, credits, search, people)
│   ├── tmdb-discover.ts     # Discovery listings, filtered by region & platforms
│   ├── tmdb-cache.ts        # Transport: token, retries, TTL cache, rate limit
│   ├── streaming-providers.ts # Platforms a region offers
│   ├── title-providers.ts   # Where one title streams, for the card overlay
│   ├── episode-progress.ts  # Per-episode watched state (localStorage)
│   ├── ratings.ts           # The viewer's own scores (localStorage)
│   ├── continue-watching*.ts # Resolves the next unwatched aired episode per show
│   ├── release-calendar*.ts # Upcoming air dates & cinema releases for followed titles
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
│   ├── last-visit.ts        # When this browser was last here
│   ├── since-last-visit-data.ts # What came out while it was away
│   ├── watchlist-view.ts    # Watchlist sorting, filtering and availability grouping
│   ├── watchlist-availability.ts # Where every saved title streams
│   ├── portable-data.ts     # Backup/restore format and its validation
│   ├── shared-list*.ts      # Encoding a list into a URL and resolving it back
│   ├── wikipedia.ts         # Wikipedia Action API client (CORS-enabled)
│   ├── region*.ts           # Region validation and data
│   ├── provider-urls.ts     # Streaming provider deep-link URL builders
│   └── utils.ts             # Slug generation and other utilities
└── types/                   # TypeScript type definitions (tmdb, filters)
```

## Caching

There is no server cache any more, so all of it is in the tab:

- **TMDb responses** — an in-memory `Map` keyed by URL (`lib/tmdb-cache.ts`),
  with per-endpoint TTLs: an hour for trending, two for watch providers, six for
  details, a day for genre lists. It also de-duplicates concurrent requests, so
  the hero and the trending row cost one call between them.
- **Request rate** — at most eight TMDb requests in flight at once, so a
  watchlist of two hundred titles does not arrive as two hundred parallel calls.
- **Service worker** — the offline page, the build's own hashed JS and CSS, and
  TMDb posters. Everything it caches is immutable at its URL, so a stale entry is
  unreachable rather than wrong. HTML and TMDb responses are deliberately never
  cached: a stale-response cache is the classic way a service worker turns into a
  bug report, and keeping HTML on the network is what makes caching the hashed
  assets safe — the markup always names this deployment's files.
- **The CDN** — every route is a static file, so it is cached at the edge and a
  crawl costs no compute at all. That was the point of the exercise.

## License

MIT — see [LICENSE](LICENSE).

## Author

**Robert Libsansky**

---

> This product uses the TMDb API but is not endorsed or certified by TMDb.
