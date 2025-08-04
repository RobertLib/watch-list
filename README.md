# WatchList - Movie & TV Show Discovery Platform

A modern Netflix-inspired web application for discovering movies and TV shows across different streaming platforms, powered by The Movie Database (TMDb) API.

## Features

- 🎬 **Browse Popular Content**: Discover trending movies and TV shows
- 🔍 **Smart Search**: Find your favorite movies and TV shows instantly
- ❤️ **Personal Watchlist**: Save movies and TV shows to your personal watchlist (stored locally in cookies)
- 📝 **Watchlist Management**: Add, remove, and organize your favorite content
- 📊 **Watchlist Counter**: Real-time counter showing number of saved items
- 🎯 **Curated Categories**:
  - Trending This Week
  - Now Playing in Theaters
  - Popular Movies & TV Shows
  - Top Rated Content
- 📱 **Responsive Design**: Beautiful interface that works on all devices
- 🎨 **Netflix-inspired UI**: Modern, clean design with smooth animations
- 🏷️ **Genre Tags**: See genres for each title
- 📺 **Streaming Platform Info**: See where content is available to watch with regional support
- ⭐ **Ratings**: View TMDb ratings and release dates
- 🔧 **Advanced Filtering**: Filter content by:
  - Genre selection
  - Release year range
  - Rating threshold (minimum rating)
  - Language (original language)
  - Adult content inclusion toggle
  - Vote count threshold
  - Custom date ranges
- 📊 **Sorting Options**: Multiple sorting criteria (popularity, rating, release date, title)
- 🌍 **Regional Support**:
  - Region-specific content and streaming providers
  - Support for 200+ countries and regions
  - Localized streaming availability information
- 📄 **Detailed Pages**: Individual movie and TV show detail pages
- 🎭 **Cast Information**: View cast and crew details
- 🎥 **Trailers**: Watch trailers directly in the app
- 📊 **Genre Categories**: Browse content by specific genres
- 🔄 **Similar Content**: Discover similar movies and TV shows
- ⚡ **Performance Optimization**:
  - Image optimization with Next.js Image component
  - Request deduplication to prevent duplicate API calls
  - Throttled API requests for better rate limiting
- 📱 **PWA Support**: Progressive Web App with app manifest for mobile installation
- 🔍 **SEO Optimization**:
  - IndexNow integration for instant search engine notifications
  - Structured data with JSON-LD
  - Optimized meta tags and OpenGraph support

## Tech Stack

- **Framework**: Next.js 15.4.5 with TypeScript and Turbopack
- **React**: React 19.1.0
- **Styling**: Tailwind CSS 4 with PostCSS
- **Icons**: Lucide React 0.536.0
- **Analytics**: Vercel Analytics 1.5.0
- **API**: The Movie Database (TMDb) API
- **Images**: Next.js Image optimization with remote pattern support
- **Linting**: ESLint 9 with Next.js configuration
- **TypeScript**: TypeScript 5

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- TMDb API key (Bearer token)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/RobertLib/watch-list.git
cd watch-list
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env.local` file in the root directory and add your TMDb API bearer token:

```env
TMDB_API_TOKEN=your_tmdb_bearer_token_here
```

> **Note**: The `.env*` files are already included in `.gitignore` to keep your API token secure.

4. Run the development server:

```bash
npm run dev
```

The development server uses Turbopack for faster builds and hot reloading.

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Getting TMDb API Key

1. Create an account at [The Movie Database](https://www.themoviedb.org/)
2. Go to your account settings → API
3. Request an API key (choose "Developer" option)
4. Copy the "API Read Access Token" (Bearer token, not the API key)
5. Use this Bearer token in your `.env.local` file

## Project Structure

```
src/
├── app/                # Next.js app directory
│   ├── [type]/        # Dynamic routes for content types
│   │   └── [slug]/    # Individual content pages
│   ├── genres/        # Genre browsing pages
│   │   ├── movie/     # Movie genre pages
│   │   └── tv/        # TV show genre pages
│   ├── movie/         # Individual movie pages
│   │   └── [slug]/    # Dynamic movie detail pages
│   ├── movies/        # Movies listing page
│   ├── profile/       # User profile page
│   ├── tv/           # Individual TV show pages
│   │   └── [slug]/   # Dynamic TV show detail pages
│   ├── tv-shows/     # TV shows listing page
│   ├── watchlist/    # Personal watchlist page
│   ├── actions.ts    # Server actions
│   ├── error.tsx     # Error boundary
│   ├── favicon.ico   # Site favicon
│   ├── global-error.tsx # Global error boundary
│   ├── globals.css   # Global styles
│   ├── layout.tsx    # Root layout
│   ├── loading.tsx   # Loading UI
│   ├── manifest.ts   # PWA manifest configuration
│   ├── opengraph-image.png # Open Graph image
│   ├── page.tsx      # Home page
│   ├── robots.ts     # Robots.txt configuration
│   └── sitemap.ts    # Sitemap configuration
├── components/       # React components
│   ├── AdvancedFiltersPanel.tsx # Advanced filtering UI
│   ├── DetailPageWatchlistButton.tsx # Watchlist button for detail pages
│   ├── FilterBar.tsx # Main filter interface
│   ├── FilterPresets.tsx # Filter preset buttons
│   ├── FilteredMovieSection.tsx # Filtered movie content
│   ├── FilteredTVSection.tsx # Filtered TV content
│   ├── Footer.tsx    # Site footer
│   ├── GenreTags.tsx # Genre display
│   ├── GenresContent.tsx # Genre browsing content
│   ├── HeroButtons.tsx # Hero section actions
│   ├── HeroSection.tsx # Featured content hero
│   ├── LanguageSupport.tsx # Language selection
│   ├── LoadMoreButton.tsx # Pagination component
│   ├── LoadingSpinner.tsx # Loading indicator
│   ├── MediaCard.tsx # Movie/TV show card
│   ├── MediaCarousel.tsx # Horizontal content carousel
│   ├── MediaGrid.tsx # Grid layout for content
│   ├── MediaSection.tsx # Content sections
│   ├── MoviesContent.tsx # Movies page content
│   ├── Navigation.tsx # Header navigation
│   ├── PageHero.tsx  # Page hero component
│   ├── PaginatedGenreMovieSection.tsx # Paginated genre movies
│   ├── PaginatedGenreTVSection.tsx # Paginated genre TV shows
│   ├── PaginatedMovieSection.tsx # Paginated movies
│   ├── PaginatedTVSection.tsx # Paginated TV shows
│   ├── ProfileContent.tsx # Profile page content
│   ├── ProfileSettingsForm.tsx # Profile settings form
│   ├── RegionSelector.tsx # Region selection
│   ├── StructuredData.tsx # Structured data for SEO
│   ├── TVShowsContent.tsx # TV shows page content
│   ├── Toast.tsx     # Toast notifications
│   ├── VideoOverlay.tsx # Video player overlay
│   ├── WatchProviderFilterSelector.tsx # Streaming provider filters
│   ├── WatchProviders.tsx # Streaming platforms display
│   ├── WatchlistButton.tsx # Watchlist add/remove button
│   ├── WatchlistCounter.tsx # Real-time watchlist counter
│   ├── WelcomePanel.tsx # Welcome/onboarding panel
│   ├── WelcomePanelContent.tsx # Welcome panel content
│   ├── carousels/    # Specialized carousel components
│   │   ├── index.ts  # Carousel exports
│   │   ├── NowPlayingCarousel.tsx
│   │   ├── PopularMoviesCarousel.tsx
│   │   ├── PopularTVShowsCarousel.tsx
│   │   ├── TopRatedMoviesCarousel.tsx
│   │   └── TrendingCarousel.tsx
│   ├── movie/        # Movie-specific components
│   │   ├── MovieCast.tsx # Movie cast display
│   │   ├── MovieDetails.tsx # Movie detail page
│   │   ├── MovieTrailerButton.tsx # Movie trailer button
│   │   ├── MovieWatchProviders.tsx # Movie streaming info
│   │   └── SimilarMovies.tsx # Similar movies section
│   └── tv/          # TV show-specific components
│       ├── SimilarTVShows.tsx # Similar TV shows section
│       ├── TVCast.tsx # TV show cast display
│       ├── TVDetails.tsx # TV show detail page
│       ├── TVTrailerButton.tsx # TV show trailer button
│       └── TVWatchProviders.tsx # TV show streaming info
├── contexts/         # React contexts
│   ├── GenresContext.tsx # Genre data context
│   └── WatchlistContext.tsx # Watchlist state management
├── hooks/           # Custom React hooks
│   └── useVideoOverlay.ts # Video overlay state
├── lib/             # Utility functions
│   ├── region-server.ts # Server-side region handling
│   ├── region.ts    # Client-side region utilities
│   ├── regions-data.ts # Region configuration data
│   ├── throttle.ts  # Throttling utilities
│   ├── tmdb-server.ts # Server-side TMDb API client
│   ├── tmdb.ts      # Client-side TMDb API client
│   ├── utils.ts     # Helper utilities
│   ├── watch-provider-server.ts # Server-side provider logic
│   ├── watch-provider-settings.ts # Provider configuration
│   └── watchlist.ts # Watchlist management utilities
└── types/           # TypeScript type definitions
    ├── filters.ts   # Filter-related types
    └── tmdb.ts      # TMDb API types
```

## Configuration Files

- `next.config.ts` - Next.js configuration with image optimization for TMDb
- `tsconfig.json` - TypeScript configuration with path aliases
- `eslint.config.mjs` - ESLint configuration using Next.js presets
- `postcss.config.mjs` - PostCSS configuration for Tailwind CSS
- `package.json` - Project dependencies and scripts
- `.gitignore` - Git ignore rules including environment files

## Public Assets

- `public/icon-192.png` - PWA icon (192x192)
- `public/icon-512.png` - PWA icon (512x512)
- `public/placeholder-movie.svg` - Placeholder image for movies without posters
- `public/screenshot-narrow.png` - App screenshot for mobile devices
- `public/screenshot-wide.png` - App screenshot for desktop devices

## Available Scripts

- `npm run dev` - Start development server with Turbopack (supports hot reloading)
- `npm run build` - Build application for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint code quality checks

## Features Roadmap

- [x] User interface for browsing content
- [x] Detailed movie/TV show pages
- [x] Advanced filtering and sorting
- [x] Regional content and streaming providers
- [x] Cast and crew information
- [x] Video trailers
- [x] Genre-based browsing
- [x] Similar content recommendations
- [x] Personal watchlist functionality (local storage via cookies)
- [x] Watchlist management and persistence
- [x] PWA manifest configuration
- [ ] User authentication and cloud sync
- [ ] User ratings and reviews
- [ ] Recommendation engine based on user preferences
- [ ] Social features (sharing, friend recommendations)
- [ ] Full offline support with service worker
- [ ] Multiple language support for UI

## Contributing

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Author

**Robert Libsansky**

## Acknowledgments

- [The Movie Database (TMDb)](https://www.themoviedb.org/) for providing the comprehensive movie and TV show data
- [Next.js](https://nextjs.org/) for the amazing React framework
- [Tailwind CSS](https://tailwindcss.com/) for the utility-first CSS framework
- [Lucide](https://lucide.dev/) for the beautiful icons

---

**Note**: This product uses the TMDb API but is not endorsed or certified by TMDb.
