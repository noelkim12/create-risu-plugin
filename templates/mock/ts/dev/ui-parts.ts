export type IconType = "html" | "img" | "none"
export type ButtonLocation = "action" | "chat" | "hamburger"
export type UiLocation = "settings" | ButtonLocation
type Action = () => void | Promise<void>

export interface ButtonOptions {
  readonly name: string
  readonly icon: string
  readonly iconType: IconType
  readonly location?: ButtonLocation
  readonly id?: string
}

export interface UiPart {
  readonly id: string
  readonly name: string
  readonly location: UiLocation
  readonly action: Action
}

export function createUiParts(onChange: (parts: readonly UiPart[]) => void) {
  const settings = new Map<string, UiPart>()
  const buttons = new Map<string, UiPart>()
  const publish = (): void => onChange([...settings.values(), ...buttons.values()])
  const validate = (name: string, iconType: IconType): void => {
    if (iconType !== "html" && iconType !== "img" && iconType !== "none") {
      throw new Error("iconType must be 'html', 'img' or 'none'")
    }
    if (typeof name !== "string" || name.trim() === "") throw new Error("name must be a non-empty string")
  }

  return {
    registerSetting(name: string, action: Action, _icon = "", iconType: IconType = "none", providedId?: string) {
      validate(name, iconType)
      const id = providedId || crypto.randomUUID()
      settings.set(id, { id, name, action, location: "settings" })
      publish()
      return { id }
    },
    registerButton(arg: ButtonOptions, action: Action) {
      validate(arg.name, arg.iconType)
      if (typeof arg.icon !== "string") throw new Error("icon must be a string")
      const id = arg.id || crypto.randomUUID()
      const location = buttons.get(id)?.location ?? (arg.location || "action")
      if (location !== "action" && location !== "chat" && location !== "hamburger") {
        throw new Error("Invalid location for button")
      }
      buttons.set(id, { id, name: arg.name, action, location })
      publish()
      return { id }
    },
    unregisterUIPart(id: string): void {
      settings.delete(id)
      buttons.delete(id)
      publish()
    },
    clear(): void {
      settings.clear()
      buttons.clear()
      publish()
    },
  }
}
