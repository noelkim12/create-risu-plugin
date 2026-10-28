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

export interface HttpStreamResponse {
  readonly ok: boolean
  readonly status: number
  readonly headers: Headers
  readonly body: AsyncIterable<Uint8Array>
}

export interface HttpTransport {
  request(request: HttpRequest): Promise<HttpResponse>
  stream(request: HttpRequest): Promise<HttpStreamResponse>
}

export interface RisuNativeFetchOptions extends RequestInit {
  readonly logFetch?: boolean
  readonly requestTimeoutMs?: number
  readonly networkRoute?: HttpRequest["networkRoute"]
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

async function* emptyStream(): AsyncIterable<Uint8Array> {
  const chunks: readonly Uint8Array[] = []
  yield* chunks
}

function streamBody(
  body: ReadableStream<Uint8Array>,
  request: HttpRequest,
  composed: ReturnType<typeof composeSignal>,
): AsyncIterable<Uint8Array> {
  const reader = body.getReader()
  const cancel = () => { void reader.cancel() }
  composed.signal.addEventListener("abort", cancel, { once: true })
  return (async function* (): AsyncIterable<Uint8Array> {
    let finished = false
    try {
      while (!finished) {
        if (composed.signal.aborted) throwRequestError(request, composed)
        const next = await reader.read()
        if (composed.signal.aborted) throwRequestError(request, composed)
        finished = next.done
        if (!next.done && next.value.byteLength > 0) yield next.value
      }
    } catch (error) {
      if (composed.signal.aborted) throwRequestError(request, composed)
      throw error
    } finally {
      composed.signal.removeEventListener("abort", cancel)
      if (!finished) await reader.cancel()
      composed.cleanup()
    }
  })()
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

  async stream(request: HttpRequest): Promise<HttpStreamResponse> {
    const composed = composeSignal(request.signal, request.timeoutMs)
    try {
      const isHostedWeb = request.networkRoute === "local_network"
        && await this.isHostedWeb(composed.signal)
      if (isHostedWeb) {
        throw new LlmError(
          "UNSUPPORTED_RUNTIME",
          "Local network endpoints are unavailable in the hosted web runtime.",
        )
      }
      const response = await this.api.nativeFetch(request.url, {
        method: request.method,
        headers: { ...request.headers },
        ...(request.body === undefined ? {} : { body: request.body }),
        signal: composed.signal,
        logFetch: false,
        requestTimeoutMs: request.timeoutMs,
        networkRoute: request.networkRoute,
      })
      if (!response.ok) {
        composed.cleanup()
        return {
          ok: response.ok,
          status: response.status,
          headers: response.headers,
          body: emptyStream(),
        }
      }
      if (response.body === null) {
        composed.cleanup()
        throw new LlmError("INVALID_RESPONSE", "Provider returned an empty streaming response.")
      }
      return {
        ok: response.ok,
        status: response.status,
        headers: response.headers,
        body: streamBody(response.body, request, composed),
      }
    } catch (error) {
      composed.cleanup()
      if (error instanceof LlmError) throw error
      throwRequestError(request, composed)
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
