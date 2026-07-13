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

function awaitWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"))

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"))
    signal.addEventListener("abort", abort, { once: true })
    promise.then(
      value => {
        signal.removeEventListener("abort", abort)
        resolve(value)
      },
      error => {
        signal.removeEventListener("abort", abort)
        reject(error)
      },
    )
  })
}

function throwRequestError(
  request: HttpRequest,
  composed: ReturnType<typeof composeSignal>,
): never {
  if (request.signal?.aborted) throw new LlmError("ABORTED", "LLM request was cancelled.")
  if (composed.timedOut()) throw new LlmError("TIMEOUT", "LLM request timed out.")
  throw new LlmError("NETWORK_ERROR", "LLM network request failed.")
}

export class NativeFetchTransport implements HttpTransport {
  constructor(private readonly api: NativeFetchApi = risuai) {}

  async request(request: HttpRequest): Promise<HttpResponse> {
    const composed = composeSignal(request.signal, request.timeoutMs)
    try {
      let isHostedWeb = false
      try {
        isHostedWeb = request.networkRoute === "local_network"
          && await this.isHostedWeb(composed.signal)
      } catch {
        throwRequestError(request, composed)
      }
      if (isHostedWeb) {
        throw new LlmError(
          "UNSUPPORTED_RUNTIME",
          "Local network endpoints are unavailable in the hosted web runtime.",
        )
      }
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
        throwRequestError(request, composed)
      }
    } finally {
      composed.cleanup()
    }
  }

  private async isHostedWeb(signal: AbortSignal): Promise<boolean> {
    try {
      const runtimeInfo = this.api.getRuntimeInfo?.()
      if (!runtimeInfo) return false
      const runtime = await awaitWithSignal(runtimeInfo, signal)
      return runtime?.platform.toLowerCase() === "web"
    } catch (error) {
      if (signal.aborted) throw error
      return false
    }
  }
}
