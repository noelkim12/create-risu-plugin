import { LlmError } from "./errors"
import type { ProviderId } from "./types"

type AdditionalJsonValue = boolean | number | string | AdditionalJsonObject

export interface AdditionalJsonObject {
  readonly [key: string]: AdditionalJsonValue
}

const SECRET_FIELD_NAMES = new Set([
  "accesskey",
  "accesskeyid",
  "accesstoken",
  "apikey",
  "authorization",
  "authtoken",
  "bearertoken",
  "clientsecret",
  "credential",
  "credentials",
  "customheaders",
  "idtoken",
  "password",
  "privatekey",
  "refreshtoken",
  "secret",
  "secretaccesskey",
  "sessiontoken",
  "token",
  "xapikey",
])
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"])
const NUMBER_PATTERN = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/
const PROTECTED_KEYS = new Set([
  "model", "messages", "contents", "systemInstruction", "cachedContent", "stream", "generationConfig", "thinkingConfig",
  "temperature", "top_p", "top_k", "max_tokens", "max_completion_tokens", "reasoning_effort", "thinking",
  "options", "url", "query", "route", "headers", "auth", "timeout", "timeoutMs", "signal",
])
const GEMINI_ALLOWED_KEYS = new Set(["toolConfig"])
const OPENAI_ALLOWED_KEYS = new Set([
  "response_format", "logit_bias", "seed", "logprobs", "top_logprobs", "n", "user", "metadata", "store",
])
const OLLAMA_ALLOWED_KEYS = new Set(["response_format", "seed", "logprobs", "top_logprobs"])
const DEEPSEEK_ALLOWED_KEYS = new Set(["response_format", "logprobs", "top_logprobs", "tool_choice"])

function invalid(message: string, provider: ProviderId): never {
  throw new LlmError("CONFIG_INVALID", message, provider)
}

class AdditionalJsonParser {
  private position = 0

  constructor(
    private readonly source: string,
    private readonly provider: ProviderId,
  ) {}

  parse(): AdditionalJsonObject {
    this.skipWhitespace()
    if (this.current() !== "{") {
      return invalid("additionalJson must decode to a JSON object.", this.provider)
    }
    const result = this.parseObject()
    this.skipWhitespace()
    if (this.position !== this.source.length) {
      return invalid("additionalJson is not valid JSON.", this.provider)
    }
    return result
  }

  private parseObject(): AdditionalJsonObject {
    const result: Record<string, AdditionalJsonValue> = {}
    const seen = new Set<string>()
    this.consume("{")
    this.skipWhitespace()
    if (this.current() === "}") {
      this.position += 1
      return result
    }
    while (true) {
      this.skipWhitespace()
      if (this.current() !== "\"") {
        return invalid("additionalJson object keys must be strings.", this.provider)
      }
      const key = this.parseString()
      if (FORBIDDEN_KEYS.has(key)) {
        return invalid("additionalJson contains a forbidden object key.", this.provider)
      }
      if (seen.has(key)) {
        return invalid("additionalJson must not contain duplicate object keys.", this.provider)
      }
      seen.add(key)
      this.skipWhitespace()
      this.consume(":")
      result[key] = this.parseValue()
      this.skipWhitespace()
      if (this.current() === "}") {
        this.position += 1
        return result
      }
      this.consume(",")
    }
  }

  private parseValue(): AdditionalJsonValue {
    this.skipWhitespace()
    switch (this.current()) {
      case "{":
        return this.parseObject()
      case "\"":
        return this.parseString()
      case "t":
        return this.parseLiteral("true", true)
      case "f":
        return this.parseLiteral("false", false)
      case "[":
        return invalid("additionalJson does not permit arrays.", this.provider)
      case "n":
        return invalid("additionalJson does not permit null.", this.provider)
      default:
        return this.parseNumber()
    }
  }

  private parseString(): string {
    const start = this.position
    this.position += 1
    while (this.position < this.source.length) {
      const character = this.current()
      if (character === "\"") {
        this.position += 1
        try {
          const decoded: unknown = JSON.parse(this.source.slice(start, this.position))
          if (typeof decoded !== "string") {
            return invalid("additionalJson is not valid JSON.", this.provider)
          }
          return decoded
        } catch (error) {
          if (error instanceof SyntaxError) {
            return invalid("additionalJson is not valid JSON.", this.provider)
          }
          throw error
        }
      }
      if (character === "\\") {
        this.position += 1
        const escapedCharacter = this.current()
        if (escapedCharacter === "" || !"\"\\/bfnrtu".includes(escapedCharacter)) {
          return invalid("additionalJson is not valid JSON.", this.provider)
        }
        if (escapedCharacter === "u") {
          for (let index = 1; index <= 4; index += 1) {
            const codeUnit = this.source[this.position + index]
            if (codeUnit === undefined || !/[0-9a-fA-F]/.test(codeUnit)) {
              return invalid("additionalJson is not valid JSON.", this.provider)
            }
          }
          this.position += 5
          continue
        }
      } else if (character.charCodeAt(0) < 0x20) {
        return invalid("additionalJson is not valid JSON.", this.provider)
      }
      this.position += 1
    }
    return invalid("additionalJson is not valid JSON.", this.provider)
  }

  private parseLiteral<T extends boolean>(literal: string, value: T): T {
    if (!this.source.startsWith(literal, this.position)) {
      return invalid("additionalJson is not valid JSON.", this.provider)
    }
    this.position += literal.length
    return value
  }

  private parseNumber(): number {
    const match = NUMBER_PATTERN.exec(this.source.slice(this.position))
    if (match === null) {
      return invalid("additionalJson is not valid JSON.", this.provider)
    }
    const text = match[0]
    this.position += text.length
    const value = Number(text)
    if (!Number.isFinite(value)) {
      return invalid("additionalJson numbers must be finite.", this.provider)
    }
    return value
  }

  private consume(expected: string): void {
    this.skipWhitespace()
    if (this.current() !== expected) {
      invalid("additionalJson is not valid JSON.", this.provider)
    }
    this.position += 1
  }

  private current(): string {
    return this.source[this.position] ?? ""
  }

  private skipWhitespace(): void {
    while ([" ", "\t", "\r", "\n"].includes(this.current())) this.position += 1
  }
}

function containsSecretField(value: AdditionalJsonObject): boolean {
  return Object.entries(value).some(([key, nested]) => (
    SECRET_FIELD_NAMES.has(key.replace(/[^A-Za-z0-9]/g, "").toLowerCase())
      || (typeof nested === "object" && containsSecretField(nested))
  ))
}

export function parseAdditionalJson(value: string, provider: ProviderId): AdditionalJsonObject | null {
  if (value.trim() === "") return null
  const parsed = new AdditionalJsonParser(value, provider).parse()
  if (containsSecretField(parsed)) {
    return invalid("additionalJson cannot contain credential fields.", provider)
  }
  return parsed
}

export function parseProviderAdditionalJson(value: string, provider: ProviderId): AdditionalJsonObject | null {
  const parsed = parseAdditionalJson(value, provider)
  if (parsed === null) return null
  const allowed = provider === "google-ai-studio" || provider === "google-vertex"
    ? GEMINI_ALLOWED_KEYS
    : provider === "openai-compatible"
      ? OPENAI_ALLOWED_KEYS
      : provider === "ollama"
        ? OLLAMA_ALLOWED_KEYS
        : DEEPSEEK_ALLOWED_KEYS
  for (const key of Object.keys(parsed)) {
    if (PROTECTED_KEYS.has(key) || ((provider === "google-ai-studio" || provider === "google-vertex") && key === "safetySettings")) {
      invalid(`additionalJson cannot override protected field ${key}.`, provider)
    }
    if (!allowed.has(key)) {
      invalid(`additionalJson does not support field ${key}.`, provider)
    }
  }
  return parsed
}
