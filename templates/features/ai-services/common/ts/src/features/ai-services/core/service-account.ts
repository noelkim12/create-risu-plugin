import { AiServiceError } from "./errors"
import { isPkcs8PrivateKey } from "./pkcs8"

export type VertexServiceAccountDefaults = {
  readonly projectId: string
  readonly location: string
}

export type ParsedVertexServiceAccount = {
  readonly projectId: string
  readonly location: string
  readonly clientEmail: string
  readonly privateKey: string
  readonly privateKeyId?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseVertexServiceAccountJson(
  value: string,
  defaults: VertexServiceAccountDefaults | null,
): ParsedVertexServiceAccount {
  let decoded: unknown
  try {
    decoded = JSON.parse(value)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new AiServiceError("CONFIG_INVALID", "Service Account JSON is not valid JSON.", { provider: "google-vertex" })
    }
    throw error
  }
  if (!isRecord(decoded) || decoded["type"] !== "service_account") {
    throw new AiServiceError("CONFIG_INVALID", "Credential type must be service_account.", { provider: "google-vertex" })
  }
  if (decoded["token_uri"] !== undefined && decoded["token_uri"] !== "https://oauth2.googleapis.com/token") {
    throw new AiServiceError("CONFIG_INVALID", "Service Account token_uri must use Google's OAuth endpoint.", { provider: "google-vertex" })
  }
  const clientEmail = typeof decoded["client_email"] === "string" ? decoded["client_email"].trim() : ""
  const privateKey = typeof decoded["private_key"] === "string" ? decoded["private_key"] : ""
  const projectId = typeof decoded["project_id"] === "string" ? decoded["project_id"].trim() : defaults?.projectId.trim() ?? ""
  const location = typeof decoded["location"] === "string" ? decoded["location"].trim() : defaults?.location.trim() || "global"
  if (clientEmail === "" || privateKey === "" || projectId === "") {
    throw new AiServiceError("CONFIG_INVALID", "Service Account JSON requires project_id, client_email, and private_key.", { provider: "google-vertex" })
  }
  if (!isPkcs8PrivateKey(privateKey)) {
    throw new AiServiceError("CONFIG_INVALID", "Service Account private_key must be PKCS#8 PEM.", { provider: "google-vertex" })
  }
  if (/[\r\n]/.test(clientEmail) || /[\r\n]/.test(projectId)) {
    throw new AiServiceError("CONFIG_INVALID", "Service Account identifiers must not contain newlines.", { provider: "google-vertex" })
  }
  if (!/^(?:global|[a-z][a-z0-9-]{1,62})$/.test(location)) {
    throw new AiServiceError("CONFIG_INVALID", "Service Account location is invalid.", { provider: "google-vertex" })
  }
  const privateKeyId = decoded["private_key_id"]
  if (typeof privateKeyId === "string" && (privateKeyId.trim() === "" || /[\r\n]/.test(privateKeyId))) {
    throw new AiServiceError("CONFIG_INVALID", "Service Account private_key_id is malformed.", { provider: "google-vertex" })
  }
  return {
    projectId,
    location,
    clientEmail,
    privateKey,
    ...(typeof privateKeyId === "string" ? { privateKeyId } : {}),
  }
}
