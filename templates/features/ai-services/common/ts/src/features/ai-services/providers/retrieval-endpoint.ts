import { AiServiceError } from "../core/errors"
import { validateEndpointUrl } from "../network/url-policy"

export const VOYAGE_RETRIEVAL_ENDPOINT = "https://api.voyageai.com"

export type RetrievalProviderEndpoint =
  | { readonly provider: "voyage" }
  | { readonly provider: "openai-compatible"; readonly endpoint: string }

export function retrievalEndpointFor(provider: RetrievalProviderEndpoint): string {
  switch (provider.provider) {
    case "voyage":
      return VOYAGE_RETRIEVAL_ENDPOINT
    case "openai-compatible":
      if (validateEndpointUrl(provider.endpoint) !== null) {
        throw new AiServiceError("CONFIG_INVALID", "The custom retrieval endpoint is invalid.", {
          provider: provider.provider,
        })
      }
      return provider.endpoint
  }
}
