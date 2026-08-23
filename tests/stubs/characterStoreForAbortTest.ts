import { defineStore } from 'pinia';

const callsKey = '__xiantuAbortCharacterStoreCalls';

function callLog(): Array<{ fn: string; at: string }> {
  const bag = globalThis as typeof globalThis & { [callsKey]?: Array<{ fn: string; at: string }> };
  if (!bag[callsKey]) bag[callsKey] = [];
  return bag[callsKey]!;
}

export function resetCharacterStoreAbortCalls() {
  callLog().length = 0;
}

export function characterStoreAbortCalls() {
  return [...callLog()];
}

export const useCharacterStore = defineStore('character-abort-test', {
  state: () => ({
    rootState: { 当前激活存档: null as null | { 角色ID: string; 存档槽位: string } },
  }),
  actions: {
    async saveCurrentGame() {
      callLog().push({ fn: 'saveCurrentGame', at: new Date().toISOString() });
    },
  },
});
