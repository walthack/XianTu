// 征兆文案的共享闸门：生成期（world-sim-refinement-pipeline.mjs）与回归期
// （tests/worldSimulationAllStages.test.mjs）必须用同一套正则，否则产物落盘后
// 就只剩更弱的那一侧在把关。
export const FORBIDDEN_OMEN_TEXT = /(玩家|系统|开发者|世界回合|回合后|倒计时|机会卡|原著|剧情|事件即将|结局|尚未发生|事情还没开始|必死|将死|终将|注定|必然|必定|一定会|已经(死亡|身亡|登基|遇袭|被俘|叛逃)|最终会|会被杀|将被杀)/u;
export const BASELINE_OMEN_TEXT = /(安排正在重新核对|相关人物、口信或行路次序|还看不出事情会往哪边走|风声有变)/u;
// 生成过程会漏进未翻译的英文残词（如“银 ingots”“内院 Curtain”），这些字段
// 或逐字推给玩家、或直接拼进叙事提示词，一律不得出现拉丁字母。
export const LATIN_RESIDUE = /[A-Za-z]/u;
