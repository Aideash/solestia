import type { InjectionKey, Ref } from 'vue'

export type EpochContext = {
  viewed: Ref<Date>
  live: Ref<boolean>
  selectedId: Ref<string | null>
}

export const epochKey: InjectionKey<EpochContext> = Symbol('epoch')
