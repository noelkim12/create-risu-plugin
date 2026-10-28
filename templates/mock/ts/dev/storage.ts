export function createMockStorage(storage: Storage, prefix: string, delay: number) {
  const keys = (): string[] => Object.keys(storage).filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length))
  const hop = async <T>(run: () => T): Promise<T> => {
    await new Promise<void>(resolve => setTimeout(resolve, delay))
    return run()
  }
  return {
    getItem: (key: string): Promise<unknown> => hop(() => {
      const value = storage.getItem(prefix + key)
      return value === null ? null : JSON.parse(value) as unknown
    }),
    setItem: (key: string, value: unknown) => hop(() => {
      const encoded = JSON.stringify(value)
      if (encoded === undefined) throw new TypeError("Mock storage requires a JSON-serializable value")
      storage.setItem(prefix + key, encoded)
    }),
    removeItem: (key: string) => hop(() => storage.removeItem(prefix + key)),
    clear: () => hop(() => { for (const key of keys()) storage.removeItem(prefix + key) }),
    keys: () => hop(keys),
    key: (index: number) => hop(() => keys()[index] ?? null),
    length: () => hop(() => keys().length),
  }
}
