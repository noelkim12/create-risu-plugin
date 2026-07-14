export type ContainerCleanup = () => void | Promise<void>

export type ContainerRenderer = (context: {
  readonly target: HTMLElement
  readonly close: () => Promise<void>
}) => void | ContainerCleanup | Promise<void | ContainerCleanup>

export class ContainerHost {
  private cleanup: ContainerCleanup | null = null
  private generation = 0
  private containerTail: Promise<void> = Promise.resolve()

  private enqueueContainer(operation: () => Promise<void>): Promise<void> {
    const result = this.containerTail.then(operation)
    this.containerTail = result.then(() => undefined, () => undefined)
    return result
  }

  private isCurrent(generation: number): boolean {
    return this.generation === generation
  }

  private async releaseCurrentView(): Promise<void> {
    const cleanup = this.cleanup
    this.cleanup = null
    await cleanup?.()
  }

  async open(renderer: ContainerRenderer): Promise<void> {
    const generation = ++this.generation
    try {
      await this.enqueueContainer(() => risuai.showContainer("fullscreen"))
      if (!this.isCurrent(generation)) return
      await this.releaseCurrentView()
      if (!this.isCurrent(generation)) return
      document.body.replaceChildren()

      const cleanup = await renderer({
        target: document.body,
        close: () => this.close(),
      })
      if (!this.isCurrent(generation)) {
        await cleanup?.()
        return
      }
      this.cleanup = cleanup ?? null
    } catch (error) {
      if (!this.isCurrent(generation)) return
      document.body.replaceChildren()
      await this.enqueueContainer(() => risuai.hideContainer())
      throw error
    }
  }

  async close(): Promise<void> {
    const generation = ++this.generation
    const hiding = this.enqueueContainer(() => risuai.hideContainer())
    await this.releaseCurrentView()
    if (this.isCurrent(generation)) document.body.replaceChildren()
    await hiding
  }

  async dispose(): Promise<void> {
    const generation = ++this.generation
    await this.releaseCurrentView()
    if (this.isCurrent(generation)) document.body.replaceChildren()
  }
}

export const containerHost = new ContainerHost()
