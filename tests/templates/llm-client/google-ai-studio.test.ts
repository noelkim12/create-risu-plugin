import { describe, expect, it } from "vitest"

import type { StoredCredential } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/types"
import type {
  HttpRequest,
  HttpTransport,
} from "../../../templates/features/llm-client/common/ts/src/features/llm-client/network/native-fetch-transport"
import { GoogleAiStudioProvider } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/providers/google-ai-studio"

describe("GoogleAiStudioProvider", () => {
  it("sends the key only as a header and normalizes the response", async () => {
    let captured: HttpRequest | undefined
    const transport: HttpTransport = {
      async request(request) {
        captured = request
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          bodyText: JSON.stringify({
            candidates: [{
              content: { parts: [{ text: "OK" }] },
              finishReason: "STOP",
            }],
          }),
        }
      },
    }
    const credential: StoredCredential = {
      schemaVersion: 1,
      slot: "google-ai-studio",
      audience: "https://generativelanguage.googleapis.com",
      revision: "revision-a",
      updatedAt: 1,
      secret: { apiKey: "google-secret" },
    }
    const provider = new GoogleAiStudioProvider(transport)

    await expect(provider.complete({
      config: {
        provider: "google-ai-studio",
        model: "gemini-test",
        timeoutMs: 60_000,
      },
      credential,
      request: { messages: [{ role: "user", content: "Reply OK" }] },
      options: {},
    })).resolves.toMatchObject({
      provider: "google-ai-studio",
      model: "gemini-test",
      text: "OK",
    })

    expect(captured).toBeDefined()
    expect(captured?.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
    )
    expect(captured?.headers).toEqual({
      "content-type": "application/json",
      "x-goog-api-key": "google-secret",
    })
    expect(captured?.url).not.toContain("google-secret")
    expect(captured?.networkRoute).toBe("auto")
    expect(JSON.parse(captured?.body ?? "")).toMatchObject({
      contents: [{ role: "user", parts: [{ text: "Reply OK" }] }],
    })
  })
})
