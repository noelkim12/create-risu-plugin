export function buildChatCompletionsUrl(baseUrl: string): string {
  const url = new URL(baseUrl.trim())
  const path = url.pathname.replace(/\/+$/, "")
  url.pathname = path.endsWith("/chat/completions")
    ? path
    : `${path}/chat/completions`
  return url.toString()
}
