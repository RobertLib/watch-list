# WatchList — Movie & TV Show Discovery Platform

A modern web application for discovering movies and TV shows, powered by [The Movie Database (TMDb) API](https://www.themoviedb.org/).

Live at **[watch-list.me](https://www.watch-list.me)**

## Features

- **Browse & Discover** — Trending content, now playing in theaters, popular and top-rated movies and TV shows
- **Detail pages** — Full info for movies, TV shows, and people: cast, crew, trailers, gallery, reviews, seasons, similar content, streaming providers, ratings, Wikipedia insights, and "Did You Know" facts
- **People pages** — Actor/director filmographies with movie and TV credits
- **Collection pages** — Movie collection groupings (e.g. film series)
- **Personal Watchlist** — Add/remove titles, persisted in cookies; real-time counter in navigation
- **Advanced Filtering & Sorting** — Genre, release year, rating, language, vote count, streaming provider, custom date ranges, multiple sort criteria
- **Regional streaming info** — Where to watch per country (200+ regions supported), deep-links to provider apps
- **Genre browsing** — Browse movies and TV shows by genre with pagination
- **Search** — Full-text search across movies, TV shows, and people
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

````env
TMDB_API_TOKEN=your_tmdb_bearer_token_here
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```bash
npm run dev
````

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
│   ├── api/                 # API routes
│   │   ├── genres/          # Movie & TV genre lists
│   │   ├── region/          # User region detection
│   │   ├── streaming-providers/ # Available streaming providers by region
│   │   ├── videos/          # Trailer/video lookup
│   │   └── watch-providers/ # Where to watch per title & region
│   ├── collection/[slug]/   # Movie collection pages
│   ├── genres/
│   │   ├── movie/[slug]/    # Movies filtered by genre
│   │   └── tv/[slug]/       # TV shows filtered by genre
│   ├── movie/[slug]/        # Movie detail pages (force-dynamic)
│   ├── movies/              # Movies listing with filtering
│   ├── people/              # People listing
│   ├── person/[slug]/       # Person detail pages
│   ├── profile/             # User profile & region settings
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
│   ├── tmdb-cache.ts        # Shared fetch cache for watch providers & discovery
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
