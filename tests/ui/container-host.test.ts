import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ContainerHost } from "../../templates/frameworks/vanilla/ts/src/ui/container-host"

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined
  let reject: (reason?: unknown) => void = () => undefined
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe("ContainerHost concurrency", () => {
  const showContainer = vi.fn().mockResolvedValue(undefined)
  const hideContainer = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.stubGlobal("risuai", { showContainer, hideContainer })
    document.body.replaceChildren()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    document.body.replaceChildren()
  })

  it("cleans a slow stale renderer without stealing the newer cleanup", async () => {
    const host = new ContainerHost()
    const slow = deferred<() => void>()
    const staleCleanup = vi.fn()
    const currentCleanup = vi.fn(() => document.getElementById("new-view")?.remove())
    const first = host.open(async () => slow.promise)
    await vi.waitFor(() => expect(showContainer).toHaveBeenCalledOnce())

    await host.open(({ target }) => {
      const view = document.createElement("div")
      view.id = "new-view"
      target.append(view)
      return currentCleanup
    })
    slow.resolve(staleCleanup)
    await first

    expect(staleCleanup).toHaveBeenCalledOnce()
    expect(currentCleanup).not.toHaveBeenCalled()
    expect(document.getElementById("new-view")).not.toBeNull()
    await host.close()
    expect(currentCleanup).toHaveBeenCalledOnce()
  })

  it.each(["close", "dispose"] as const)(
    "invalidates and cleans a slow renderer after %s",
    async action => {
      const host = new ContainerHost()
      const slow = deferred<() => void>()
      const staleCleanup = vi.fn()
      const opening = host.open(async ({ target }) => {
        const view = document.createElement("div")
        view.id = "slow-view"
        target.append(view)
        return slow.promise
      })
      await vi.waitFor(() => expect(document.getElementById("slow-view")).not.toBeNull())

      await host[action]()
      slow.resolve(staleCleanup)
      await opening

      expect(staleCleanup).toHaveBeenCalledOnce()
      expect(document.getElementById("slow-view")).toBeNull()
    },
  )

  it("does not let a stale renderer error hide a newer view", async () => {
    const host = new ContainerHost()
    const slow = deferred<void>()
    const first = host.open(async () => slow.promise)
    await vi.waitFor(() => expect(showContainer).toHaveBeenCalledOnce())
    await host.open(({ target }) => {
      const view = document.createElement("div")
      view.id = "new-view"
      target.append(view)
    })

    slow.reject(new Error("stale render failure"))
    await expect(first).resolves.toBeUndefined()
    expect(document.getElementById("new-view")).not.toBeNull()
    expect(hideContainer).not.toHaveBeenCalled()
  })
})
