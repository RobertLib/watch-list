# IndexNow Implementation

IndexNow is a protocol created by Microsoft that allows websites to instantly notify search engines (Bing, Yandex, and others) about new or updated pages. This implementation automatically submits URLs to IndexNow for better SEO and faster indexing.

## Features

- ✅ Automatic submission of current page on load
- ✅ Server Actions for backend usage
- ✅ React Hook for frontend usage
- ✅ Context Provider for easy management
- ✅ Component for automatic tracking
- ✅ API route for external usage
- ✅ Support for multiple URLs
- ✅ Debug mode for development
- ✅ Graceful error handling

## Files

- `src/lib/indexnow.ts` - Main IndexNow library
- `src/hooks/useIndexNow.ts` - React hook for frontend
- `src/contexts/IndexNowContext.tsx` - Context provider
- `src/components/IndexNowTracker.tsx` - Component for automatic tracking
- `src/app/api/indexnow/route.ts` - API route
- `src/app/actions.ts` - Server actions (extended)
- `public/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6.txt` - API key file

## Configuration

### Environment Variables

Create a `.env.local` file with the following variables:

```bash
# IndexNow API key (optional, has default value)
INDEXNOW_API_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6

# Base URL of your website (required)
NEXT_PUBLIC_BASE_URL=https://www.watch-list.me

# Debug mode (optional)
NEXT_PUBLIC_INDEXNOW_DEBUG=false
```

### API Key File

The file `public/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6.txt` must contain your API key and be accessible at:
`https://yourdomain.com/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6.txt`

## Usage

### Automatic Tracking (already implemented)

The `IndexNowTracker` component is automatically included in `layout.tsx` and submits the current page on every load.

### Server Actions

```typescript
import { submitPathToIndexNow, notifyIndexNowOfUpdate } from "@/app/actions";

// Submit a specific path
await submitPathToIndexNow("/movie/new-movie-123");

// Notify of update (uses current path or homepage)
await notifyIndexNowOfUpdate();
```

### Frontend Hook

```typescript
import { useIndexNow } from "@/hooks/useIndexNow";

function MyComponent() {
  const { submitCurrentPage, submitPath } = useIndexNow();

  const handleSubmit = async () => {
    // Submit current page
    await submitCurrentPage();

    // Or submit a specific path
    await submitPath("/movie/some-movie-123");
  };

  return <button onClick={handleSubmit}>Submit to IndexNow</button>;
}
```

### Context Provider

```typescript
import { useIndexNowContext } from "@/contexts/IndexNowContext";

function MovieComponent({ movieId, slug }: { movieId: number; slug: string }) {
  const { submitMoviePage } = useIndexNowContext();

  useEffect(() => {
    // Automatically submit movie page
    submitMoviePage(movieId, slug);
  }, [movieId, slug]);

  return <div>Movie content...</div>;
}
```

### API Route

```bash
# POST request
curl -X POST https://yourdomain.com/api/indexnow \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://yourdomain.com/movie/new-movie"]}'

# GET request for testing
curl https://yourdomain.com/api/indexnow
```

## Behavior

- **Production**: Submits URLs to IndexNow normally
- **Development**: Skips submission (unless debug mode is enabled)
- **Errors**: Logs errors to console but doesn't crash
- **Multiple endpoints**: Tries Bing, Yandex, and api.indexnow.org
- **Rate limiting**: Automatically handled by search engines

## Supported Search Engines

- Microsoft Bing
- Yandex
- Seznam.cz (through api.indexnow.org)
- Other search engines that support the IndexNow protocol

## Debugging

To enable debug logging:

1. Set `NEXT_PUBLIC_INDEXNOW_DEBUG=true` in `.env.local`
2. Or run in development mode

Debug logs will be shown in browser console (frontend) and server console (backend).

## Security

- API key is public (this is fine according to IndexNow specification)
- Domain ownership verification happens through the API key file
- No sensitive information is exposed

## Performance

- Submission is asynchronous and doesn't block UI
- 1-second delay after page load for better UX
- Graceful handling of failed requests
- Minimal overhead

## Monitoring

You can monitor IndexNow submissions in:

- Browser console (with debug mode)
- Server logs
- Network tab in dev tools
- Bing Webmaster Tools (after registering your site)
