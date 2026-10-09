const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function getApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL;
  if (!configuredUrl) return '';

  try {
    const parsedUrl = new URL(configuredUrl, window.location.origin);
    const appIsOnLan = !LOOPBACK_HOSTS.has(window.location.hostname);
    if (appIsOnLan && LOOPBACK_HOSTS.has(parsedUrl.hostname)) {
      return '';
    }
    return parsedUrl.origin;
  } catch {
    console.warn('Ignoring invalid VITE_API_URL; using the current application origin.');
    return '';
  }
}
