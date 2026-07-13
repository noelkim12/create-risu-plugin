import { describe, expect, it } from "vitest"

import {
  buildChatCompletionsUrl,
  isLocalNetworkUrl,
  networkRouteForUrl,
  validateEndpointUrl,
} from "../../../templates/features/llm-client/common/ts/src/features/llm-client/network/url-policy"

describe("LLM endpoint policy", () => {
  it("normalizes a base URL to one Chat Completions path", () => {
    expect(buildChatCompletionsUrl("https://api.example/v1/"))
      .toBe("https://api.example/v1/chat/completions")
    expect(buildChatCompletionsUrl("https://api.example/v1/chat/completions"))
      .toBe("https://api.example/v1/chat/completions")
  })

  it("recognizes loopback and private network endpoints", () => {
    expect(isLocalNetworkUrl("http://127.0.0.1:11434/v1")).toBe(true)
    expect(isLocalNetworkUrl("http://192.168.1.20:11434/v1")).toBe(true)
    expect(isLocalNetworkUrl("http://[fd00::1]:11434/v1")).toBe(true)
    expect(networkRouteForUrl("http://localhost:11434/v1")).toBe("local_network")
    expect(networkRouteForUrl("https://api.example/v1")).toBe("auto")
  })

  it("allows HTTPS and local HTTP while rejecting unsafe URL features", () => {
    expect(validateEndpointUrl("https://api.example/v1")).toBeNull()
    expect(validateEndpointUrl("http://localhost:11434/v1")).toBeNull()
    expect(validateEndpointUrl("http://api.example/v1")).toBe("Use HTTPS for public endpoints.")
    expect(validateEndpointUrl("https://user:pass@api.example/v1"))
      .toBe("URL credentials are not allowed.")
    expect(validateEndpointUrl("https://api.example/v1?key=secret"))
      .toBe("Endpoint URLs cannot contain a query or fragment.")
  })
})
