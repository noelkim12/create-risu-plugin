import { describe, expect, it, vi } from "vitest"

import { LlmError } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/errors"
import { NativeFetchTransport } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/network/native-fetch-transport"

describe("NativeFetchTransport", () => {
  it("rejects local network requests on the hosted web runtime", async () => {
    const nativeFetch = vi.fn()
    const transport = new NativeFetchTransport({
      nativeFetch,
      getRuntimeInfo: vi.fn().mockResolvedValue({
        apiVersion: "3.0",
        platform: "web",
        saveMethod: "local",
      }),
    })

    await expect(transport.request({
      url: "http://127.0.0.1:11434/v1/chat/completions",
      method: "POST",
      headers: {},
      timeoutMs: 60_000,
      networkRoute: "local_network",
    })).rejects.toMatchObject<LlmError>({ code: "UNSUPPORTED_RUNTIME" })
    expect(nativeFetch).not.toHaveBeenCalled()
  })

  it("honors caller abort while hosted-web runtime detection is stalled", async () => {
    const nativeFetch = vi.fn()
    const transport = new NativeFetchTransport({
      nativeFetch,
      getRuntimeInfo: vi.fn(() => new Promise(() => {})),
    })
    const caller = new AbortController()

    const request = transport.request({
      url: "http://127.0.0.1:11434/v1/chat/completions",
      method: "POST",
      headers: {},
      signal: caller.signal,
      timeoutMs: 60_000,
      networkRoute: "local_network",
    })
    caller.abort()

    await expect(Promise.race([
      request,
      new Promise(resolve => setTimeout(() => resolve("runtime lookup stalled"), 100)),
    ])).rejects.toMatchObject<LlmError>({ code: "ABORTED" })
    expect(nativeFetch).not.toHaveBeenCalled()
  })

  it("honors wrapper timeout while hosted-web runtime detection is stalled", async () => {
    const nativeFetch = vi.fn()
    const transport = new NativeFetchTransport({
      nativeFetch,
      getRuntimeInfo: vi.fn(() => new Promise(() => {})),
    })

    const request = transport.request({
      url: "http://127.0.0.1:11434/v1/chat/completions",
      method: "POST",
      headers: {},
      timeoutMs: 1,
      networkRoute: "local_network",
    })

    await expect(Promise.race([
      request,
      new Promise(resolve => setTimeout(() => resolve("runtime lookup stalled"), 100)),
    ])).rejects.toMatchObject<LlmError>({ code: "TIMEOUT" })
    expect(nativeFetch).not.toHaveBeenCalled()
  })

  it("forces secret-safe logging, timeout, abort, and local routing options", async () => {
    const nativeFetch = vi.fn().mockResolvedValue(new Response('{"ok":true}', {
      status: 200,
      headers: { "content-type": "application/json" },
    }))
    const controller = new AbortController()
    const transport = new NativeFetchTransport({ nativeFetch })

    await expect(transport.request({
      url: "http://127.0.0.1:11434/v1/chat/completions",
      method: "POST",
      headers: { Authorization: "Bearer secret" },
      body: "{}",
      signal: controller.signal,
      timeoutMs: 60_000,
      networkRoute: "local_network",
    })).resolves.toMatchObject({ ok: true, status: 200, bodyText: '{"ok":true}' })

    expect(nativeFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: "{}",
        logFetch: false,
        requestTimeoutMs: 60_000,
        networkRoute: "local_network",
      }),
    )
  })

  it("distinguishes caller abort from wrapper timeout", async () => {
    const nativeFetch = vi.fn((_url: string, options?: RequestInit) => {
      if (options?.signal?.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"))
      }
      return new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        )
      })
    })
    const transport = new NativeFetchTransport({ nativeFetch })

    const caller = new AbortController()
    caller.abort()
    await expect(transport.request({
      url: "https://api.example/v1",
      method: "POST",
      headers: {},
      body: "{}",
      signal: caller.signal,
      timeoutMs: 60_000,
      networkRoute: "auto",
    })).rejects.toMatchObject<LlmError>({ code: "ABORTED" })

    await expect(transport.request({
      url: "https://api.example/v1",
      method: "POST",
      headers: {},
      body: "{}",
      timeoutMs: 1,
      networkRoute: "auto",
    })).rejects.toMatchObject<LlmError>({ code: "TIMEOUT" })
  })
})
