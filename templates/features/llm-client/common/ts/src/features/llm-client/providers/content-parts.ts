import { LlmError } from "../core/errors"
import { assertValidResponsePart } from "../core/validation"
import type {
  LlmContentPart,
  LlmResponsePart,
  SavedModelConfig,
} from "../core/types"

type UnknownRecord = Readonly<Record<string, unknown>>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function record(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null
}

function unsupported(model: SavedModelConfig, feature: string): never {
  throw new LlmError("UNSUPPORTED_FEATURE", `${feature} is not supported by ${model.provider}.`, model.provider)
}

function inputFlag(part: Exclude<LlmContentPart, { readonly type: "text" }>): string {
  switch (part.type) {
    case "image":
      return "hasImageInput"
    case "audio":
      return "hasAudioInput"
    case "video":
      return "hasVideoInput"
  }
}

function assertInputSupported(model: SavedModelConfig, part: LlmContentPart): void {
  if (part.type !== "text" && !model.flags.includes(inputFlag(part))) {
    unsupported(model, `${part.type} input`)
  }
}

function responsePart(
  type: "image" | "audio" | "video",
  base64: unknown,
  mimeType: unknown,
  model: SavedModelConfig,
): LlmResponsePart {
  if (typeof base64 !== "string" || typeof mimeType !== "string") {
    throw new LlmError("INVALID_RESPONSE", "Provider returned malformed media output.", model.provider)
  }
  const part: LlmResponsePart = type === "image"
    ? { type, base64, mimeType }
    : type === "audio"
      ? { type, base64, mimeType }
      : { type, base64, mimeType }
  try {
    assertValidResponsePart(part, model)
  } catch (error) {
    if (error instanceof LlmError && error.code === "CONFIG_INVALID") {
      throw new LlmError("INVALID_RESPONSE", "Provider returned malformed media output.", model.provider)
    }
    throw error
  }
  return part
}

function mediaType(mimeType: string): "image" | "audio" | "video" | null {
  const [type] = mimeType.split("/", 1)
  if (type === "image" || type === "audio" || type === "video") return type
  return null
}

function dataUrlPart(value: unknown, model: SavedModelConfig): LlmResponsePart {
  if (typeof value !== "string") {
    throw new LlmError("INVALID_RESPONSE", "Provider returned malformed image output.", model.provider)
  }
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (match === null) {
    throw new LlmError("INVALID_RESPONSE", "Provider returned malformed image output.", model.provider)
  }
  const mimeType = match[1]
  const base64 = match[2]
  if (mimeType === undefined || base64 === undefined) {
    throw new LlmError("INVALID_RESPONSE", "Provider returned malformed image output.", model.provider)
  }
  const type = mediaType(mimeType)
  if (type === null) {
    throw new LlmError("INVALID_RESPONSE", "Provider returned unsupported media output.", model.provider)
  }
  return responsePart(type, base64, mimeType, model)
}

export function toGeminiParts(
  model: SavedModelConfig,
  content: string | readonly LlmContentPart[],
): readonly UnknownRecord[] {
  if (typeof content === "string") return [{ text: content }]
  return content.map(part => {
    assertInputSupported(model, part)
    if (part.type === "text") return { text: part.text }
    return { inlineData: { mimeType: part.mimeType, data: part.base64 } }
  })
}

export function toOpenAiContent(
  model: SavedModelConfig,
  content: string | readonly LlmContentPart[],
): string | readonly UnknownRecord[] {
  if (typeof content === "string") return content
  return content.map(part => {
    assertInputSupported(model, part)
    switch (part.type) {
      case "text":
        return { type: "text", text: part.text }
      case "image":
        return { type: "image_url", image_url: { url: `data:${part.mimeType};base64,${part.base64}` } }
      case "audio":
        return { type: "input_audio", input_audio: { data: part.base64, format: part.mimeType.slice("audio/".length) } }
      case "video":
        return unsupported(model, "video input")
      default:
        return unsupported(model, "content input")
    }
  })
}

export function fromGeminiParts(value: unknown, model: SavedModelConfig): readonly LlmResponsePart[] {
  if (!Array.isArray(value)) {
    throw new LlmError("INVALID_RESPONSE", "Gemini response did not contain content parts.", model.provider)
  }
  return value.map(value => {
    const part = record(value)
    if (part === null) {
      throw new LlmError("INVALID_RESPONSE", "Gemini response contained an invalid content part.", model.provider)
    }
    if (typeof part["text"] === "string") return { type: "text", text: part["text"] }
    const inlineData = record(part["inlineData"])
    const mimeType = inlineData?.["mimeType"]
    const type = typeof mimeType === "string" ? mediaType(mimeType) : null
    if (inlineData === null || type === null) {
      throw new LlmError("INVALID_RESPONSE", "Gemini response contained unsupported content output.", model.provider)
    }
    return responsePart(type, inlineData["data"], mimeType, model)
  })
}

export function fromOpenAiContent(value: unknown, model: SavedModelConfig): readonly LlmResponsePart[] {
  if (typeof value === "string") return [{ type: "text", text: value }]
  if (!Array.isArray(value)) {
    throw new LlmError("INVALID_RESPONSE", "OpenAI-compatible response did not contain content.", model.provider)
  }
  return value.map(value => {
    const part = record(value)
    if (part === null || typeof part["type"] !== "string") {
      throw new LlmError("INVALID_RESPONSE", "OpenAI-compatible response contained an invalid content part.", model.provider)
    }
    switch (part["type"]) {
      case "text":
      case "output_text":
        if (typeof part["text"] !== "string") {
          throw new LlmError("INVALID_RESPONSE", "OpenAI-compatible response contained malformed text.", model.provider)
        }
        return { type: "text", text: part["text"] }
      case "image_url": {
        const image = record(part["image_url"])
        return dataUrlPart(image?.["url"], model)
      }
      case "audio": {
        const audio = record(part["audio"])
        const format = audio?.["format"]
        if (audio === null || typeof format !== "string") {
          throw new LlmError("INVALID_RESPONSE", "OpenAI-compatible response contained malformed audio.", model.provider)
        }
        return responsePart("audio", audio["data"], `audio/${format}`, model)
      }
      default:
        throw new LlmError("INVALID_RESPONSE", "OpenAI-compatible response contained unsupported content output.", model.provider)
    }
  })
}

export function fromOpenAiAudio(value: unknown, model: SavedModelConfig): LlmResponsePart | null {
  if (value === undefined) return null
  const audio = record(value)
  const format = audio?.["format"]
  if (audio === null || typeof format !== "string") {
    throw new LlmError("INVALID_RESPONSE", "OpenAI-compatible response contained malformed audio.", model.provider)
  }
  return responsePart("audio", audio["data"], `audio/${format}`, model)
}
