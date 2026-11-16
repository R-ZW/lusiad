/** Random Quick Tunnel hosts are allowed only in the explicitly enabled evaluation mode. */
export function isCloudflareTunnelHost(host: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com(?::443)?$/i.test(host)
}

/** Never authorize a request using forwarded headers supplied by the caller. */
export function authorizedFrontendOrigin(configuredOrigin: string, host: string | null, origin: string | null, allowCloudflareTunnel = false): string | null {
  try {
    if (!host || /[\s\\/@?#,%]/.test(host)) return null
    const expected = new URL(configuredOrigin)
    const candidates = [expected.origin]
    if (allowCloudflareTunnel && isCloudflareTunnelHost(host)) candidates.push(new URL(`https://${host}`).origin)
    for (const candidate of candidates) {
      const url = new URL(candidate), received = new URL(`${url.protocol}//${host}`)
      if (received.username || received.password || received.pathname !== '/' || received.search || received.hash || received.origin !== candidate) continue
      if (origin !== null && new URL(origin).href !== `${candidate}/`) continue
      return candidate
    }
    return null
  } catch { return null }
}

/** Browser -> Next remains protected against foreign origins and rebinding hosts. */
export function allowsFrontendRequest(configuredOrigin: string, host: string | null, origin: string | null, allowCloudflareTunnel = false): boolean {
  return authorizedFrontendOrigin(configuredOrigin, host, origin, allowCloudflareTunnel) !== null
}

/** Next Server Actions must see the same host that has just passed our origin check. */
export function frontendForwardHeaders(incoming: Headers, authorizedOrigin: string): Headers {
  const url = new URL(authorizedOrigin), headers = new Headers(incoming)
  headers.set('x-forwarded-host', url.host)
  headers.set('x-forwarded-proto', url.protocol.slice(0, -1))
  return headers
}
