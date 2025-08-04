/** Keep partial answers, but surface an outage when no title could be loaded. */
export function throwIfAllRequestsFailed(
  results: readonly PromiseSettledResult<unknown>[],
): void {
  if (results.some((result) => result.status === "fulfilled")) return;

  // A removed title is a real empty result. Transport failures, rate limits and
  // server errors are unknown results and should reach the page's retry notice.
  const failure = results.find(
    (result) =>
      result.status === "rejected" &&
      !(
        result.reason instanceof Error &&
        /^TMDB API error: 404\b/.test(result.reason.message)
      ),
  );
  if (failure?.status === "rejected") throw failure.reason;
}
