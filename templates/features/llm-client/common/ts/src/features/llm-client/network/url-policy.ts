function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }
  const [first = -1, second = -1] = parts
  return first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 169 && second === 254)
    || first === 127
}

function isPrivateIpv6(hostname: string): boolean {
  if (!hostname.includes(":")) return false
  const firstSegment = hostname.split(":", 1)[0] ?? ""
  return firstSegment.startsWith("fc")
    || firstSegment.startsWith("fd")
    || /^fe[89ab]/.test(firstSegment)
}

export function isLocalNetworkUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.replace(/^\[|\]$/g, "").toLowerCase()
    return hostname === "localhost"
      || hostname === "::1"
      || hostname.endsWith(".local")
      || isPrivateIpv4(hostname)
      || isPrivateIpv6(hostname)
  } catch {
    return false
  }
}

export function validateEndpointUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.username || url.password) return "URL credentials are not allowed."
    if (url.search || url.hash) return "Endpoint URLs cannot contain a query or fragment."
    if (url.protocol === "https:") return null
    if (url.protocol === "http:" && isLocalNetworkUrl(value)) return null
    return "Use HTTPS for public endpoints."
  } catch {
    return "Enter a valid absolute URL."
  }
}

export function buildChatCompletionsUrl(baseUrl: string): string {
  const error = validateEndpointUrl(baseUrl)
  if (error) throw new Error(error)
  const url = new URL(baseUrl.trim())
  const path = url.pathname.replace(/\/+$/, "")
  url.pathname = path.endsWith("/chat/completions")
    ? path
    : `${path}/chat/completions`
  return url.toString()
}

export function networkRouteForUrl(value: string): "auto" | "local_network" {
  return isLocalNetworkUrl(value) ? "local_network" : "auto"
}
