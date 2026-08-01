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
- **Your own ratings** — Score anything out of ten; rating a title marks it watched. Highly rated titles pull harder on your recommendations and poorly rated ones stop feeding them altogether
- **Backup & transfer** — Download everything this browser holds as a JSON file and restore it anywhere, ratings and settings included; there is no account, so this is the only copy that exists
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
│   ├── api/                 # API routes
│   │   ├── daily/image/     # Proxied puzzle still – keeps the answer off the client
│   │   ├── genres/          # Movie & TV genre lists
│   │   ├── region/          # User region detection
│   │   ├── streaming-providers/ # Available streaming providers by region
│   │   ├── videos/          # Trailer/video lookup
│   │   └── watch-providers/ # Where to watch per title & region
│   ├── collection/[slug]/   # Movie collection pages
│   ├── list/[items]/        # Shared list opened from a link (noindex)
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
│   ├── calendar-ics.ts      # iCalendar (.ics) export of the release calendar
│   ├── daily-puzzle*.ts     # Daily puzzle rules, film pool and answer resolution
│   ├── daily-game.ts        # Board, streak and stats (localStorage)
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

## License

MIT — see [LICENSE](LICENSE).

## Author

**Robert Libsansky**

---

> This product uses the TMDb API but is not endorsed or certified by TMDb.
