import { defineStore } from 'pinia';

export const useCharacterStore = defineStore('character-abort-test', {
  state: () => ({
    rootState: { 当前激活存档: null as null | { 角色ID: string; 存档槽位: string } },
  }),
  actions: {
    async saveCurrentGame() {
      return undefined;
    },
  },
});
