import { LlmError } from "../core/errors"

export interface HttpRequest {
  readonly url: string
  readonly method: "GET" | "POST"
  readonly headers: Readonly<Record<string, string>>
  readonly body?: string
  readonly signal?: AbortSignal
  readonly timeoutMs: number
  readonly networkRoute: "auto" | "local_network"
}

export interface HttpResponse {
  readonly ok: boolean
  readonly status: number
  readonly headers: Headers
  readonly bodyText: string
}

export interface HttpTransport {
  request(request: HttpRequest): Promise<HttpResponse>
}

export interface NativeFetchApi {
  nativeFetch(url: string, options?: RisuNativeFetchOptions): Promise<Response>
  getRuntimeInfo?(): Promise<{ readonly platform: string }>
}

function composeSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener("abort", abort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
    },
  }
}

export class NativeFetchTransport implements HttpTransport {
  constructor(private readonly api: NativeFetchApi = risuai) {}

  async request(request: HttpRequest): Promise<HttpResponse> {
    if (request.networkRoute === "local_network" && await this.isHostedWeb()) {
      throw new LlmError(
        "UNSUPPORTED_RUNTIME",
        "Local network endpoints are unavailable in the hosted web runtime.",
      )
    }
    const composed = composeSignal(request.signal, request.timeoutMs)
    try {
      const response = await this.api.nativeFetch(request.url, {
        method: request.method,
        headers: { ...request.headers },
        ...(request.body === undefined ? {} : { body: request.body }),
        signal: composed.signal,
        logFetch: false,
        requestTimeoutMs: request.timeoutMs,
        networkRoute: request.networkRoute,
      })
      return {
        ok: response.ok,
        status: response.status,
        headers: response.headers,
        bodyText: await response.text(),
      }
    } catch {
      if (request.signal?.aborted) throw new LlmError("ABORTED", "LLM request was cancelled.")
      if (composed.timedOut()) throw new LlmError("TIMEOUT", "LLM request timed out.")
      throw new LlmError("NETWORK_ERROR", "LLM network request failed.")
    } finally {
      composed.cleanup()
    }
  }

  private async isHostedWeb(): Promise<boolean> {
    try {
      const runtime = await this.api.getRuntimeInfo?.()
      return runtime?.platform.toLowerCase() === "web"
    } catch {
      return false
    }
  }
}
