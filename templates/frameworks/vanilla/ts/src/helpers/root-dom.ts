/**
 * Helpers for mounting UI onto the host (main) DOM via `risuai.getRootDocument()`.
 *
 * Why this file exists — the main DOM is only reachable through SafeElement RPC
 * proxies, which carry three recurring pitfalls:
 *
 * 1. Permission: `getRootDocument()` needs the `mainDom` permission and returns
 *    null (or throws) when denied. Every helper here degrades to `null` instead.
 * 2. Async mismatch: the type declarations show `createElement()` as synchronous,
 *    but at runtime EVERY method on a bridged proxy returns a Promise. Forgetting
 *    to await `createElement` hands you a Promise whose `.setStyle` is undefined.
 *    `resolveRemote()` below absorbs that mismatch.
 * 3. Cleanup: `addEventListener` returns a listener id that must be passed back
 *    to `removeEventListener`. The mount handle tracks ids and releases them.
 *
 * @example
 * ```typescript
 * import { mountRootElement } from "./helpers/root-dom";
 *
 * // A persistent status badge in the bottom-right corner of the host UI.
 * const badge = await mountRootElement({
 *   styles: {
 *     position: "fixed",
 *     right: "12px",
 *     bottom: "12px",
 *     zIndex: "999",
 *     padding: "4px 10px",
 *     borderRadius: "999px",
 *     fontSize: "12px",
 *     color: "#fff",
 *     background: "rgba(16, 130, 90, 0.92)",
 *   },
 *   text: "⚡ Ready",
 * });
 *
 * // `badge` is null when the user denied the mainDom permission — the plugin
 * // should keep working without it.
 * if (badge !== null) {
 *   await badge.setText("⚡ 3 updates");
 *   await badge.setStyle("background", "rgba(160, 120, 20, 0.92)");
 * }
 *
 * // Nested elements and click handling:
 * const toast = await mountRootElement({
 *   styles: { position: "fixed", left: "50%", bottom: "24px" },
 *   children: [
 *     { tag: "span", text: "Saved!" },
 *     {
 *       tag: "button",
 *       text: "Dismiss",
 *       on: { click: () => void toast?.remove() },
 *     },
 *   ],
 * });
 *
 * // Always release on unload:
 * await risuai.onUnload(() => {
 *   void badge?.remove();
 *   void toast?.remove();
 * });
 * ```
 */

export interface RootElementSpec {
  /** Tag name, default "div". Non-whitelisted tags are replaced with "div" by the host. */
  readonly tag?: string;
  /** Text content (`setTextContent`). */
  readonly text?: string;
  /** Style properties in camelCase (`element.style[property] = value` on the host). */
  readonly styles?: Readonly<Record<string, string>>;
  /** CSS classes added one by one via `addClass`. */
  readonly classNames?: readonly string[];
  /** Custom attributes — the host only allows names starting with "x-". */
  readonly attributes?: Readonly<Record<string, string>>;
  /** Child elements, built depth-first and appended before the root mount. */
  readonly children?: readonly RootElementSpec[];
  /** Event listeners keyed by event type. Ids are tracked and released by `remove()`. */
  readonly on?: Readonly<Record<string, (event: unknown) => void>>;
}

export interface RootElementHandle {
  /** The underlying SafeElement, for manipulation this handle does not cover. */
  readonly element: SafeElement;
  setText(value: string): Promise<void>;
  setStyle(property: string, value: string): Promise<void>;
  setStyles(styles: Readonly<Record<string, string>>): Promise<void>;
  /** Removes tracked listeners and detaches the element. Safe to call twice. */
  remove(): Promise<void>;
}

export interface MountRootElementOptions {
  /** Parent to append to. Defaults to the root document element. */
  readonly parent?: SafeElement;
}

/**
 * The bridged proxies return Promises from every method even where the type
 * declarations say otherwise (e.g. `createElement`). Passing values through
 * here makes the await explicit without fighting the declared types.
 */
const resolveRemote = <T>(value: T | Promise<T>): Promise<T> => Promise.resolve(value);

/**
 * `getRootDocument()` that never throws: returns null when the mainDom
 * permission is denied or the call fails.
 */
export async function getRootDocumentSafe(): Promise<SafeDocument | null> {
  try {
    return (await risuai.getRootDocument()) ?? null;
  } catch (error) {
    console.warn("getRootDocument is unavailable (mainDom permission denied?)", error);
    return null;
  }
}

type TrackedListener = {
  readonly element: SafeElement;
  readonly type: string;
  readonly id: string;
};

const buildElement = async (
  rootDocument: SafeDocument,
  spec: RootElementSpec,
  listeners: TrackedListener[],
): Promise<SafeElement> => {
  const element = await resolveRemote(rootDocument.createElement(spec.tag ?? "div"));

  for (const [property, value] of Object.entries(spec.styles ?? {})) {
    await element.setStyle(property, value);
  }
  for (const className of spec.classNames ?? []) {
    await element.addClass(className);
  }
  for (const [name, value] of Object.entries(spec.attributes ?? {})) {
    await element.setAttribute(name, value);
  }
  if (spec.text !== undefined) {
    await element.setTextContent(spec.text);
  }
  for (const child of spec.children ?? []) {
    await element.appendChild(await buildElement(rootDocument, child, listeners));
  }
  for (const [type, listener] of Object.entries(spec.on ?? {})) {
    const id = await element.addEventListener(type, listener);
    listeners.push({ element, type, id });
  }

  return element;
};

/**
 * Builds an element tree from `spec` and appends it to the host DOM.
 * Returns null when the mainDom permission is denied — callers should treat
 * the mounted UI as optional.
 */
export async function mountRootElement(
  spec: RootElementSpec,
  options?: MountRootElementOptions,
): Promise<RootElementHandle | null> {
  const rootDocument = await getRootDocumentSafe();
  if (rootDocument === null) {
    return null;
  }

  const listeners: TrackedListener[] = [];
  const element = await buildElement(rootDocument, spec, listeners);
  await (options?.parent ?? rootDocument).appendChild(element);

  let removed = false;
  return {
    element,
    setText: (value) => element.setTextContent(value),
    setStyle: (property, value) => element.setStyle(property, value),
    setStyles: async (styles) => {
      for (const [property, value] of Object.entries(styles)) {
        await element.setStyle(property, value);
      }
    },
    remove: async () => {
      if (removed) {
        return;
      }
      removed = true;
      for (const listener of listeners) {
        await listener.element.removeEventListener(listener.type, listener.id).catch(() => undefined);
      }
      await element.remove();
    },
  };
}
