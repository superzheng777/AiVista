/** Personal lists also refresh after known mutations and server events. */
export const personalResourceListPolicy = {
  staleTime: 30 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
};

/** Keep the current browsing results until explicitly refreshed or evicted. */
export const publicResourceListPolicy = {
  staleTime: Infinity,
  gcTime: 10 * 60 * 1000,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
};
