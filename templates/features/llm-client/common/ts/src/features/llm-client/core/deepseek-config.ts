import { buildChatCompletionsUrl } from "../network/url-policy"

export const DEEPSEEK_API_BASE_URL = "https://api.deepseek.com"
export const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions"

export function isOfficialDeepSeekBaseUrl(value: string): boolean {
  try {
    return buildChatCompletionsUrl(value) === DEEPSEEK_CHAT_COMPLETIONS_URL
  } catch (error) {
    if (error instanceof Error) return false
    throw error
  }
}
