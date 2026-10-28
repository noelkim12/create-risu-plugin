import { PLUGIN_NAME } from "../../../constants/plugin"

export interface LocalStoragePort {
  getItem<T>(key: string): Promise<T | null>
  setItem<T>(key: string, value: T): Promise<void>
  removeItem(key: string): Promise<void>
  keys(): Promise<string[]>
}

export type LocalStorageFactory = () => Promise<LocalStoragePort>

export const defaultLocalStorageFactory: LocalStorageFactory = () => risuai.getLocalPluginStorage()
