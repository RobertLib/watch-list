# WatchList — Movie & TV Show Discovery Platform

A modern web application for discovering movies and TV shows, powered by [The Movie Database (TMDb) API](https://www.themoviedb.org/).

Live at **[watch-list.me](https://www.watch-list.me)**

## Features

- **Browse & Discover** — Trending content, now playing in theaters, popular and top-rated movies and TV shows
- **Detail pages** — Full info for movies, TV shows, and people: cast, crew, trailers, gallery, reviews, seasons, similar content, streaming providers, ratings, Wikipedia insights, and "Did You Know" facts
- **People pages** — Actor/director filmographies with movie and TV credits
- **Collection pages** — Movie collection groupings (e.g. film series)
- **Personal Watchlist** — Add/remove titles, persisted in cookies; real-time counter in navigation
- **Watchlist sorting, filtering & grouping** — Sort by date added, title, rating or release; filter by media type or title search; or group the whole list by where each title can be watched right now ("ready on your platforms", "rent or buy only", "not streaming in your region")
- **Episode tracking** — Tick individual episodes or a whole aired season; per-season progress bars and a "Continue Watching" row on the home page that offers the next unwatched episode of every series in progress
- **Release calendar** — Upcoming episode air dates and cinema releases for everything you follow, grouped by planning horizon, with an `.ics` export into your own calendar app
- **Subscribable calendar feed** — The same dates behind a `webcal://` URL your calendar app re-fetches on its own, with a reminder attached to every entry. New episodes appear without anyone opening the site; the titles travel in the URL, so there is still no account and no server-side record
- **What to watch tonight** — One pick off your own list, filtered by the time you actually have, whether it is streaming on your platforms right now, and the mood you are in. A grid is what you were already stuck in
- **Browse by mood** — Curated, server-rendered pages for the way people really choose: something easy, something mind-bending, something under ninety minutes, lights off
- **Rank your watchlist** — Pairwise duels ("which of these two?") folded into an Elo rating, ending in a personal top ten that shares as a link
- **Compare two lists** — Paste a friend's share link and see what you have both already saved. Both lists live in the URL, so the overlap needs no accounts on either side
- **Named lists** — Lists of your own beyond the watchlist ("October horror", "films to show my dad"), each shareable as a link
- **Your stats** — Hours watched, top genres, decades you live in, a histogram of your own scores, achievements, a yearly target and a year in review worth sharing
- **Profiles** — More than one person per browser, with separate watchlists, ticks, ratings and streaks
- **Puzzle archive & a second game** — Every daily puzzle that has run is still playable, with a streak calendar and badges; plus "higher or lower", an endless run on TMDb ratings
- **Since you were last here** — The home page opens with what aired while you were away, rather than looking identical to the last visit
- **Offline & installable** — A service worker keeps the app openable with no connection and serves posters from cache
- **Your own ratings** — Score anything out of ten; rating a title marks it watched. Highly rated titles pull harder on your recommendations and poorly rated ones stop feeding them altogether
- **Backup & transfer** — Download everything this browser holds as a JSON file and restore it anywhere — ratings, named lists, ranking, goal and settings included. There is no account, so this is the only copy that exists, and the app says so once your list is big enough to be worth losing
- **Shareable lists** — Turn a list into a link that carries the titles in the URL itself. No records stored server-side; the recipient saves the whole list in one click
- **Daily film puzzle** — Guess the film from a blurred still. One puzzle a day, the same for everybody, six guesses, a clue per wrong one, and a streak. The answer stays server-side: the image is proxied and the hints are assembled per guess
- **Advanced Filtering & Sorting** — Genre, release year, rating, language, vote count, streaming provider, custom date ranges, multiple sort criteria
- **Regional streaming info** — Where to watch per country (200+ regions supported), deep-links to provider apps
- **Genre browsing** — Browse movies and TV shows by genre with pagination
- **Search** — Instant preview in the header plus a real `/search?q=` page: server-rendered, paginated with linkable URLs, reachable with `/` or `Cmd/Ctrl+K` from anywhere
- **SEO** — Structured data (JSON-LD), sitemap, robots.txt, OpenGraph/Twitter cards
- **PWA** — App manifest for mobile installation

## Tech Stack

|           |                                     |
| --------- | ----------------------------------- |
| Framework | Next.js 16 (App Router, Turbopack)  |
| Language  | TypeScript 6                        |
| UI        | React 19, Tailwind CSS 4            |
| Icons     | Lucide React                        |
| API       | TMDb REST API, Wikipedia Action API |

## Getting Started

### Prerequisites

- Node.js 18+
- TMDb API Bearer token ([how to get one](https://developer.themoviedb.org/docs/getting-started))

### Installation

```bash
git clone https://github.com/RobertLib/watch-list.git
cd watch-list
npm install
```

Create `.env.local`:

```env
TMDB_API_TOKEN=your_tmdb_bearer_token_here
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available Scripts

```bash
npm run dev    # Development server (Turbopack)
npm run build  # Production build
npm run start  # Production server
npm run lint   # ESLint
```

## Project Structure

```
src/
├── app/
│   ├── about/               # About page
│   ├── calendar/            # Release calendar (noindex, client-driven)
│   ├── daily/               # Daily film puzzle
│   │   ├── [day]/           # One puzzle out of the archive (noindex)
│   │   ├── archive/         # Every puzzle that has run
│   │   └── higher-lower/    # Endless rating game
│   ├── api/                 # API routes
│   │   ├── calendar/[items]/ # Subscribable .ics feed – the list is the URL
│   │   ├── daily/image/     # Proxied puzzle still – keeps the answer off the client
│   │   ├── genres/          # Movie & TV genre lists
│   │   ├── region/          # User region detection
│   │   ├── streaming-providers/ # Available streaming providers by region
│   │   ├── videos/          # Trailer/video lookup
│   │   └── watch-providers/ # Where to watch per title & region
│   ├── collection/[slug]/   # Movie collection pages
│   ├── list/[items]/        # Shared list opened from a link (noindex)
│   ├── lists/               # Your own named lists (noindex)
│   ├── match/               # Compare two watchlists
│   │   └── [mine]/[theirs]/ # The overlap, computed from two links (noindex)
│   ├── mood/                # Browse by mood
│   │   └── [slug]/          # One curated mood
│   ├── offline/             # Served by the service worker with no connection
│   ├── stats/               # Your watching stats (noindex)
│   ├── tonight/             # What to watch tonight
│   ├── genres/
│   │   ├── movie/[slug]/    # Movies filtered by genre
│   │   └── tv/[slug]/       # TV shows filtered by genre
│   ├── movie/[slug]/        # Movie detail pages (force-dynamic)
│   ├── movies/              # Movies listing with filtering
│   ├── people/              # People listing
│   ├── person/[slug]/       # Person detail pages
│   ├── profile/             # User profile, region settings & backup
│   ├── search/              # Search results page (noindex, paginated)
│   ├── tv/[slug]/           # TV show detail pages (force-dynamic)
│   ├── tv-shows/            # TV shows listing with filtering
│   ├── watchlist/           # Personal watchlist (noindex, client-only)
│   │   └── ranking/         # Pairwise ranking of the watchlist (noindex)
│   └── [type]/[slug]/       # Legacy redirect routes
├── components/
│   ├── carousels/           # Homepage carousels (trending, popular, top-rated, now playing)
│   ├── movie/               # Movie-specific components
│   ├── person/              # Person-specific components
│   ├── skeletons/           # Loading skeleton components
│   └── tv/                  # TV-specific components
├── contexts/                # React contexts (watchlist, genres)
├── hooks/                   # Custom hooks (useVideoOverlay)
├── lib/
│   ├── tmdb.ts              # TMDb API client (detail fetches, no-store)
│   ├── tmdb-server.ts       # Server-side discovery API with provider/region filtering
│   ├── tmdb-cache.ts        # Shared fetch cache for watch providers, TV/season details & discovery
│   ├── episode-progress.ts  # Per-episode watched state (localStorage)
│   ├── ratings.ts           # The viewer's own scores (localStorage)
│   ├── continue-watching*.ts # Resolves the next unwatched aired episode per show
│   ├── release-calendar*.ts # Upcoming air dates & cinema releases for followed titles
│   ├── calendar-ics.ts      # iCalendar (.ics) export, with alarms and a refresh hint
│   ├── calendar-feed.ts     # Encoding the calendar into a subscribable URL
│   ├── daily-puzzle*.ts     # Daily puzzle rules, film pool and answer resolution
│   ├── daily-game.ts        # Board, streak, history and archive (localStorage)
│   ├── daily-badges.ts      # Badges, derived from the game state
│   ├── rating-duel-server.ts # "Higher or lower" – the answer stays server-side
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
│   ├── since-last-visit-server.ts # What came out while it was away
│   ├── watchlist-view.ts    # Watchlist sorting, filtering and availability grouping
│   ├── watchlist-availability.ts # Where every saved title streams, in one round trip
│   ├── portable-data.ts     # Backup/restore format and its validation
│   ├── shared-list*.ts      # Encoding a list into a URL and resolving it back
│   ├── did-you-know.ts      # "Did You Know" fact builder from TMDb data
│   ├── wikipedia.ts         # Wikipedia API client for editorial context
│   ├── region*.ts           # Region detection, validation, and data
│   ├── provider-urls.ts     # Streaming provider deep-link URL builders
│   └── utils.ts             # Slug generation and other utilities
└── types/                   # TypeScript type definitions (tmdb, filters)
```

## Caching Strategy

- **Homepage** — ISR, revalidated every 24 hours (`revalidate = 86400`)
- **Detail pages** (movie, TV, person, collection) — `force-dynamic`, rendered on every request; TMDb detail fetches use `cache: "no-store"`. Watch providers are loaded lazily client-side via `/api/watch-providers`.
- **List/discovery pages** — `force-dynamic`; TMDb discovery fetches cached 24 hours via Next.js fetch cache with per-region cache keys
- **Watch providers API** — cached 2 hours per title+region
- **Wikipedia content** — cached 7 days via Next.js fetch cache
- **Calendar feed** — one hour at the edge; the underlying TMDB detail reads are cached six, and subscribers are asked to re-fetch every twelve
- **Mood pages** — ISR, revalidated every 24 hours
- **Service worker** — caches the offline page and TMDB posters only. HTML and API responses are deliberately never cached: every page here is either personal or goes stale within hours

## License

MIT — see [LICENSE](LICENSE).

## Author

**Robert Libsansky**

---

> This product uses the TMDb API but is not endorsed or certified by TMDb.
