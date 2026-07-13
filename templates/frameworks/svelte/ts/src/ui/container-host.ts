export type ContainerCleanup = () => void | Promise<void>

export type ContainerRenderer = (context: {
  readonly target: HTMLElement
  readonly close: () => Promise<void>
}) => void | ContainerCleanup | Promise<void | ContainerCleanup>

export class ContainerHost {
  private cleanup: ContainerCleanup | null = null

  private async releaseCurrentView(): Promise<void> {
    const cleanup = this.cleanup
    this.cleanup = null
    await cleanup?.()
  }

  async open(renderer: ContainerRenderer): Promise<void> {
    await risuai.showContainer("fullscreen")
    await this.releaseCurrentView()
    document.body.replaceChildren()

    try {
      const cleanup = await renderer({
        target: document.body,
        close: () => this.close(),
      })
      this.cleanup = cleanup ?? null
    } catch (error) {
      document.body.replaceChildren()
      await risuai.hideContainer()
      throw error
    }
  }

  async close(): Promise<void> {
    await this.releaseCurrentView()
    document.body.replaceChildren()
    await risuai.hideContainer()
  }

  async dispose(): Promise<void> {
    await this.releaseCurrentView()
    document.body.replaceChildren()
  }
}

export const containerHost = new ContainerHost()
