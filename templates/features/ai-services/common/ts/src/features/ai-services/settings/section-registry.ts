import { AiServiceError } from "../core/errors"
import type { AiServiceSectionId } from "../core/types"

export type AiServiceSectionCleanup = () => void

export type AiServiceSectionContext = {
  readonly target: HTMLElement
  readonly close: () => Promise<void>
}

export type AiServiceSectionMount = (context: AiServiceSectionContext) => AiServiceSectionCleanup

export type AiServiceSection = {
  readonly id: AiServiceSectionId
  readonly label: string
  readonly order: number
  readonly mount: AiServiceSectionMount
}

export const AI_SERVICE_SECTION_ORDER: Readonly<Record<AiServiceSectionId, number>> = {
  keys: 0,
  llm: 1,
  embedding: 2,
  "contextual-embedding": 3,
  reranker: 4,
}

export class AiServiceSectionRegistry {
  private readonly sections = new Map<AiServiceSectionId, AiServiceSection>()

  register(section: AiServiceSection): () => void {
    if (this.sections.has(section.id)) {
      throw new AiServiceError("CONFIG_INVALID", "An AI Services section is already registered.")
    }
    this.sections.set(section.id, section)
    return () => this.sections.delete(section.id)
  }

  list(): readonly AiServiceSection[] {
    return [...this.sections.values()].sort((left, right) => left.order - right.order)
  }
}
