export class MemoryLocalStorage {
  readonly values = new Map<string, unknown>()
  readonly clearCalls: number[] = []

  async getItem<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value))
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key)
  }

  async keys(): Promise<string[]> {
    return [...this.values.keys()]
  }

  async clear(): Promise<void> {
    this.clearCalls.push(Date.now())
    this.values.clear()
  }
}
