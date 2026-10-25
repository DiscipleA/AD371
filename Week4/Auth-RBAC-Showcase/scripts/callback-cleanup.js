/* Do not import provider tokens from confirmation links. Remove auth callback
 * parameters before any other page scripts/assets run; login remains explicit.
 * No token is stored, logged, sent to our API, or rendered by this cleanup.
 */
(() => {
  const url = new URL(location.href);
  const authParams = ['code', 'access_token', 'refresh_token', 'token_type', 'expires_in', 'expires_at', 'provider_token', 'provider_refresh_token', 'error', 'error_description', 'error_code', 'token_hash'];
  let changed = false;
  for (const key of authParams) {
    if (url.searchParams.has(key)) { url.searchParams.delete(key); changed = true; }
  }
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (authParams.some(key => fragment.has(key))) { url.hash = ''; changed = true; }
  if (changed) history.replaceState(null, '', url.pathname + url.search + url.hash);
})();
