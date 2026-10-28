import { describe, expect, it, vi } from "vitest"

export type ConnectionState = {
  readonly operation: string
  readonly statusMessage: string
}

export type DeferredRelease = {
  readonly resolve: () => void
}

export type ConnectionControllerHarness = {
  readonly load: () => Promise<void>
  readonly test: () => Promise<void>
  readonly cancel: () => void
  readonly state: () => ConnectionState
  readonly signals: () => readonly AbortSignal[]
  readonly saveCount: () => number
  readonly failWith: (error: Error) => void
  readonly deferTest: () => DeferredRelease
  readonly deferLoad: () => DeferredRelease
  readonly typedError: (kind: "shared" | "capability") => Error
  readonly genericFailureMessage: string
}

export function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T | PromiseLike<T>) => void
} {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise })
  return { promise, resolve }
}

export function runConnectionControllerContract(
  name: string,
  createHarness: () => ConnectionControllerHarness,
): void {
  describe(name, () => {
    it("tests a saved configuration and does not persist settings", async () => {
      const harness = createHarness()
      await harness.load()

      await harness.test()

      expect(harness.signals()).toHaveLength(1)
      expect(harness.state()).toEqual({
        operation: "success",
        statusMessage: "Connected to voyage / test-model.",
      })
      expect(harness.saveCount()).toBe(0)
    })

    for (const kind of ["shared", "capability"] as const) {
      it(`preserves a safe ${kind} error`, async () => {
        const harness = createHarness()
        harness.failWith(harness.typedError(kind))
        await harness.load()

        await harness.test()

        expect(harness.state()).toEqual({ operation: "error", statusMessage: `Safe ${kind} failure.` })
      })
    }

    it("sanitizes an unknown provider failure", async () => {
      const harness = createHarness()
      harness.failWith(new Error("secret=raw-key payload={private}"))
      await harness.load()

      await harness.test()

      expect(harness.state()).toEqual({ operation: "error", statusMessage: harness.genericFailureMessage })
      expect(harness.state().statusMessage).not.toContain("raw-key")
      expect(harness.state().statusMessage).not.toContain("payload")
    })

    it("cancels the active request and suppresses its late result", async () => {
      const harness = createHarness()
      const pending = harness.deferTest()
      await harness.load()
      const active = harness.test()
      await vi.waitFor(() => expect(harness.signals()).toHaveLength(1))

      harness.cancel()
      pending.resolve()
      await active

      expect(harness.signals()[0]?.aborted).toBe(true)
      expect(harness.state()).toEqual({ operation: "idle", statusMessage: "Connection test cancelled." })
    })

    it("ignores a duplicate test while one is active", async () => {
      const harness = createHarness()
      const pending = harness.deferTest()
      await harness.load()
      const active = harness.test()
      await vi.waitFor(() => expect(harness.signals()).toHaveLength(1))

      await harness.test()

      expect(harness.signals()).toHaveLength(1)
      harness.cancel()
      pending.resolve()
      await active
    })

    it("does not start a test while a settings mutation is busy", async () => {
      const harness = createHarness()
      await harness.load()
      const pendingLoad = harness.deferLoad()
      const activeLoad = harness.load()
      await vi.waitFor(() => expect(harness.state().operation).toBe("loading"))

      await harness.test()

      expect(harness.signals()).toHaveLength(0)
      pendingLoad.resolve()
      await activeLoad
    })

    it("aborts a test when a new load supersedes it", async () => {
      const harness = createHarness()
      const pending = harness.deferTest()
      await harness.load()
      const active = harness.test()
      await vi.waitFor(() => expect(harness.signals()).toHaveLength(1))

      await harness.load()
      pending.resolve()
      await active

      expect(harness.signals()[0]?.aborted).toBe(true)
      expect(harness.state().statusMessage).not.toContain("Connected")
    })
  })
}
