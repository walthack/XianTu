<template>
  <div class="sect-members">
    <!-- 我的宗门身份 -->
    <div class="my-sect-identity">
      <div class="identity-header">
        <Crown :size="16" />
        <span>我的宗门身份</span>
      </div>
      <div class="identity-content">
        <div class="identity-stats">
          <div class="stat-item">
            <span class="stat-label">所属宗门</span>
            <span class="stat-value sect-name">{{ playerSectName }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">职位</span>
            <span class="stat-value position">{{ playerPosition }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">贡献点</span>
            <span class="stat-value contribution">{{ playerContribution }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">声望</span>
            <span class="stat-value reputation">{{ playerReputation }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">加入时间</span>
            <span class="stat-value join-date">{{ formatJoinDate(playerJoinDate) }}</span>
          </div>
        </div>
        <div class="identity-actions">
          <button class="leave-sect-btn" @click="requestLeaveSect">
            <LogOut :size="14" />
            <span>退出宗门</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 宗门领导层（来自势力信息/宗门档案，不依赖NPC关系） -->
    <div class="leadership-card" v-if="playerSectName !== '未加入宗门'">
      <div class="leadership-header">
        <div class="leadership-title">
          <Crown :size="14" />
          <span>宗门高层</span>
        </div>
        <button v-if="!sectLeadership" class="ask-btn small" @click="generateLeadership" :disabled="isGeneratingLeadership">
          <RefreshCw :size="14" :class="{ spin: isGeneratingLeadership }" />
          <span>{{ isGeneratingLeadership ? '生成中...' : '生成高层' }}</span>
        </button>
      </div>

      <div v-if="sectLeadership" class="leadership-grid">
        <div class="leader-item primary">
          <span class="role">宗主</span>
          <span class="name">{{ sectLeadership.宗主 }}</span>
          <span class="realm" v-if="sectLeadership.宗主修为">{{ sectLeadership.宗主修为 }}</span>
          <button class="link" @click="sendPrompt(`我想拜见${playerSectName}宗主「${sectLeadership.宗主}」`)">拜见</button>
        </div>
        <div class="leader-item" v-if="sectLeadership.副宗主">
          <span class="role">副宗主</span>
          <span class="name">{{ sectLeadership.副宗主 }}</span>
          <button class="link" @click="sendPrompt(`我想向${playerSectName}副宗主「${sectLeadership.副宗主}」请教`)">请教</button>
        </div>
        <div class="leader-item" v-if="sectLeadership.太上长老">
          <span class="role">太上长老</span>
          <span class="name">{{ sectLeadership.太上长老 }}</span>
          <span class="realm" v-if="sectLeadership.太上长老修为">{{ sectLeadership.太上长老修为 }}</span>
          <button class="link" @click="sendPrompt(`我想拜见${playerSectName}太上长老「${sectLeadership.太上长老}」`)">拜见</button>
        </div>
        <div class="leader-item" v-if="sectLeadership.长老数量">
          <span class="role">
            长老数量
            <span class="hint-wrapper" title="此为宗门宏观设定的全宗规模上限，下方列表仅展示当前活跃或与你有交集的成员">
              <Info :size="10" class="hint-icon" />
            </span>
          </span>
          <span class="name">{{ sectLeadership.长老数量 }}位</span>
        </div>
        <div class="leader-item" v-if="sectLeadership.最强修为">
          <span class="role">最强修为</span>
          <span class="name">{{ sectLeadership.最强修为 }}</span>
        </div>
        <div class="leader-item" v-if="sectLeadership.综合战力">
          <span class="role">战力</span>
          <span class="name">{{ sectLeadership.综合战力 }}/100</span>
        </div>
      </div>

      <div v-else class="leadership-empty">
        <span>暂无宗门高层信息（可在“宗门概览”生成势力信息，或点击上方“询问高层”）</span>
      </div>
    </div>

    <!-- 成员分类 -->
    <div class="member-tabs">
      <button
        v-for="tab in memberTabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <component :is="tab.icon" :size="14" />
        <span>{{ tab.label }}</span>
        <span v-if="getMemberCount(tab.key) > 0" class="count-badge">{{ getMemberCount(tab.key) }}</span>
      </button>
      <!-- 常驻的重新生成按钮，有无数据均可用 -->
      <button class="tab-regen-btn" @click="generateMembers" :disabled="isGeneratingMembers || !playerSectName || playerSectName === '未加入宗门'">
        <RefreshCw :size="13" :class="{ spin: isGeneratingMembers }" />
        <span>{{ isGeneratingMembers ? '生成中...' : '新增宗门其他角色' }}</span>
      </button>
    </div>

    <!-- 成员列表 -->
    <div class="member-list">
      <div v-if="filteredMembers.length === 0" class="empty-state">
        <Users :size="48" class="empty-icon" />
        <p class="empty-text">暂无同门信息</p>
        <p class="empty-hint">同门信息由AI根据剧情生成</p>
        <button class="ask-btn" @click="generateMembers" :disabled="isGeneratingMembers">
          <RefreshCw :size="14" :class="{ spin: isGeneratingMembers }" />
          <span>{{ isGeneratingMembers ? '生成中...' : '生成同门' }}</span>
        </button>
      </div>

      <div v-else class="members">
        <div
          v-for="member in filteredMembers"
          :key="member.id"
          class="member-card"
          :class="{ 'is-self': member.isSelf }"
          @click="selectMember(member)"
        >
          <div class="member-avatar">
            <span class="avatar-text">{{ member.name.charAt(0) }}</span>
            <span class="gender-badge" :class="member.gender === '女' ? 'female' : 'male'">
              {{ member.gender === '女' ? '♀' : '♂' }}
            </span>
          </div>

          <div class="member-info">
            <div class="member-header">
              <span class="member-name">{{ member.name }}</span>
              <span class="member-position" :class="getPositionClass(member.position)">
                {{ member.position }}
              </span>
            </div>
            <div class="member-details">
              <span class="detail-item realm">
                <Zap :size="12" />
                {{ member.realm }}
              </span>
              <span class="detail-item relation" :class="getRelationClass(member.relation)">
                <Heart :size="12" />
                {{ member.relation }}
              </span>
            </div>
          </div>

          <div class="member-actions">
            <button
              class="evolve-btn"
              title="根据当前宗门发展演化该成员（更新境界与职位）"
              @click.stop="evolveMember(member)"
              :disabled="evolvingMembers.has(member.id)"
            >
              <RefreshCw v-if="evolvingMembers.has(member.id)" :size="14" class="spin" />
              <span>更新职位与境界</span>
            </button>
            <ChevronRight :size="16" class="arrow-icon" />
          </div>
        </div>
      </div>
    </div>


    <!-- 提示信息 -->
    <div class="members-notice">
      <Info :size="14" />
      <span>同门关系会影响游戏发展，可在对话中与同门互动</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import {entityName} from "@/modules/scenarioMods/namedEntities";
import { ref, computed } from 'vue';
import { useGameStateStore } from '@/stores/gameStateStore';
import { useCharacterStore } from '@/stores/characterStore';
import {
  Users, ChevronRight, Zap, Heart, Info,
  Crown, User, UserCircle, LogOut, RefreshCw
} from 'lucide-vue-next';
import { toast } from '@/utils/toast';
import { sendChat } from '@/utils/chatBus';
import { generateWithRawPrompt } from '@/utils/tavernCore';
import { parseJsonSmart } from '@/utils/jsonExtract';
import { aiService } from '@/services/aiService';
import { detectPlayerSectLeadership } from '@/utils/sectLeadershipUtils';
import type { WorldFaction, WorldInfo } from '@/types/game';

const gameStateStore = useGameStateStore();
const characterStore = useCharacterStore();
const activeTab = ref<string>('all');
const isGeneratingLeadership = ref(false);
const isGeneratingMembers = ref(false);
const evolvingMembers = ref<Set<string>>(new Set());

// 获取玩家名字
const playerName = computed(() => gameStateStore.character?.名字 || '');

// 获取所有宗门列表
const allSects = computed(() => {
  const data = gameStateStore.getCurrentSaveData();
  const worldInfo = (data as any)?.世界?.信息 as WorldInfo | undefined;
  return (worldInfo?.势力信息 || []) as WorldFaction[];
});

// 检测玩家宗门领导地位
const leaderInfo = computed(() => {
  return detectPlayerSectLeadership(
    playerName.value,
    allSects.value,
    gameStateStore.sectMemberInfo
  );
});

// 成员分类
const memberTabs = [
  { key: 'all', label: '全部', icon: Users },
  { key: '高层', label: '高层', icon: Crown },
  { key: '真传', label: '真传', icon: UserCircle },
  { key: '内门', label: '内门', icon: User },
  { key: '外门', label: '外门', icon: User }
];

// 玩家宗门信息
const playerSectInfo = computed(() => gameStateStore.sectMemberInfo);
const playerSectName = computed(() => leaderInfo.value.sectName || playerSectInfo.value?.宗门名称 || '未加入宗门');
const playerPosition = computed(() => leaderInfo.value.position || playerSectInfo.value?.职位 || '散修');
const playerContribution = computed(() => playerSectInfo.value?.贡献 || 0);
const playerReputation = computed(() => playerSectInfo.value?.声望 || 0);
const playerJoinDate = computed(() => playerSectInfo.value?.加入日期 || '');

// 格式化加入日期
function formatJoinDate(dateStr: string | undefined): string {
  if (!dateStr) return '未知';
  try {
    const date = new Date(dateStr);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  } catch {
    return dateStr;
  }
}

// 退出宗门
function requestLeaveSect() {
  if (!playerSectInfo.value?.宗门名称) {
    toast.error('你还未加入任何宗门');
    return;
  }
  // 清空宗门信息
  gameStateStore.sectMemberInfo = null;
  toast.success('已退出宗门');
}

const currentSectFaction = computed(() => {
  const sectName = String(playerSectName.value || '').trim();
  if (!sectName || sectName === '未加入宗门') return null;
  const fromSystem = (gameStateStore.sectSystem as any)?.宗门档案?.[sectName] ?? null;
  if (fromSystem) return fromSystem;
  const list = gameStateStore.worldInfo?.势力信息;
  if (!Array.isArray(list)) return null;
  return (list as any[]).find((f) => f?.名称 === sectName) ?? null;
});

const sectLeadership = computed(() => {
  const leadership = currentSectFaction.value?.领导层;
  if (!leadership || typeof leadership !== 'object') return null;
  const master = String((leadership as any).宗主 || '').trim();
  if (!master) return null;
  return leadership as any;
});

// 从人物关系中获取同门
const sectMembers = computed(() => {
  const relations = gameStateStore.relationships || {};

  // 筛选同门NPC
  return Object.entries(relations)
    .filter(([_, npc]: [string, any]) => {
      // 检查是否属于同一宗门
      const npcSect = entityName('faction',npc.势力归属 || npc.宗门 || '');
      return npcSect === playerSectName.value;
    })
    .map(([name, npc]: [string, any]) => ({
      id: name,
      name: npc.名字 || name,
      gender: npc.性别 || '男',
      position: npc.职位 || '弟子',
      realm: formatRealm(npc.境界),
      relation: getRelationText(npc.好感度),
      favorability: npc.好感度 || 50,
      isSelf: false,
      category: getCategory(npc.职位)
    }));
});

// 过滤后的成员
const filteredMembers = computed(() => {
  if (activeTab.value === 'all') return sectMembers.value;
  return sectMembers.value.filter(m => m.category === activeTab.value);
});

// 获取各分类成员数量
function getMemberCount(tabKey: string): number {
  if (tabKey === 'all') return sectMembers.value.length;
  return sectMembers.value.filter(m => m.category === tabKey).length;
}

// 格式化境界
function formatRealm(realm: any): string {
  if (!realm) return '未知';
  if (typeof realm === 'string') return realm;
  if (typeof realm === 'object') {
    return `${realm.名称 || ''}${realm.阶段 || ''}`;
  }
  return '未知';
}

// 好感度转关系文本
function getRelationText(favorability: number | undefined): string {
  const fav = favorability || 50;
  if (fav >= 90) return '挚友';
  if (fav >= 75) return '好友';
  if (fav >= 60) return '友好';
  if (fav >= 40) return '普通';
  if (fav >= 20) return '冷淡';
  return '敌视';
}

// 获取成员分类
function getCategory(position: string | undefined): string {
  if (!position) return '外门';
  if (position.includes('宗主') || position.includes('掌门')) return '高层';
  if (position.includes('副宗主') || position.includes('副掌门')) return '高层';
  if (position.includes('长老') || position.includes('太上')) return '高层';
  // 常见高层头衔（堂主、峰主、殿主、执事、护法等）
  if (position.includes('堂主') || position.includes('峰主') || position.includes('殿主')) return '高层';
  if (position.includes('执事') || position.includes('职事') || position.includes('护法')) return '高层';
  if (position.includes('执法') || position.includes('上人') || position.includes('尊者')) return '高层';
  if (position.includes('使者') || position.includes('督统') || position.includes('统领')) return '高层';
  if (position.includes('真传') || position.includes('核心')) return '真传';
  if (position.includes('内门')) return '内门';
  return '外门';
}

// 职位样式
function getPositionClass(position: string): string {
  if (position.includes('宗主') || position.includes('掌门')) return 'position-leader';
  if (position.includes('副宗主') || position.includes('副掌门')) return 'position-leader';
  if (position.includes('长老') || position.includes('太上')) return 'position-elder';
  // 常见高层头衔
  if (position.includes('堂主') || position.includes('峰主') || position.includes('殿主')) return 'position-elder';
  if (position.includes('执事') || position.includes('职事') || position.includes('护法')) return 'position-elder';
  if (position.includes('执法') || position.includes('上人') || position.includes('尊者')) return 'position-elder';
  if (position.includes('使者') || position.includes('督统') || position.includes('统领')) return 'position-elder';
  if (position.includes('真传') || position.includes('核心')) return 'position-true';
  if (position.includes('内门')) return 'position-inner';
  return 'position-outer';
}

// 关系样式
function getRelationClass(relation: string): string {
  const classMap: Record<string, string> = {
    '挚友': 'relation-best',
    '好友': 'relation-good',
    '友好': 'relation-friendly',
    '普通': 'relation-normal',
    '冷淡': 'relation-cold',
    '敌视': 'relation-hostile'
  };
  return classMap[relation] || 'relation-normal';
}

// 选择成员
function selectMember(member: { name: string }) {
  const prompt = `我想和${member.name}交谈`;
  sendPrompt(prompt);
}

function sendPrompt(text: string) {
  sendChat(text);
  toast.success('已发送到对话');
}

// 生成宗门高层信息
async function generateLeadership() {
  if (isGeneratingLeadership.value) return;
  const sectName = playerSectName.value;
  if (!sectName || sectName === '未加入宗门') {
    toast.warning('未加入宗门');
    return;
  }
  isGeneratingLeadership.value = true;
  try {
    const worldInfo = gameStateStore.worldInfo;
    const sectProfile = (gameStateStore.sectSystem as any)?.宗门档案?.[sectName] ?? null;

    const worldContext = worldInfo ? {
      世界名称: worldInfo.世界名称,
      世界背景: worldInfo.世界背景,
    } : null;

    const prompt = `
# 任务：生成【宗门高层】信息
为宗门「${sectName}」生成领导层信息。

## 输出格式
只输出 1 个 JSON 对象：
{"leadership":{...}}

## leadership 对象字段
{
  "宗主": "string（名字）",
  "宗主修为": "string（境界）",
  "副宗主": "string（可选）",
  "太上长老": "string（可选）",
  "太上长老修为": "string（可选）",
  "长老数量": number,
  "最强修为": "string",
  "综合战力": number（1-100）
}

## 世界背景
${JSON.stringify(worldContext).slice(0, 400)}

## 宗门档案
${JSON.stringify(sectProfile).slice(0, 800)}
    `.trim();

    const raw = await generateWithRawPrompt('生成宗门高层', prompt, false, 'sect_generation');
    const parsed = parseJsonSmart(raw, aiService.isForceJsonEnabled('sect_generation')) as {
      leadership?: any;
    };

    if (!parsed.leadership) {
      throw new Error('leadership 字段缺失');
    }

    // 更新宗门档案中的领导层
    const saveData = gameStateStore.getCurrentSaveData();
    if (saveData) {
      const updated = typeof structuredClone === 'function'
        ? structuredClone(saveData)
        : JSON.parse(JSON.stringify(saveData));

      const socialRoot = ((updated as any).社交 ??= {});
      const sectRoot = (socialRoot.宗门 ??= {});
      const profileRoot = (sectRoot.宗门档案 ??= {});
      const profile = (profileRoot[sectName] ??= {});
      profile.领导层 = parsed.leadership;

      gameStateStore.loadFromSaveData(updated);
      await characterStore.saveCurrentGame();
    }
    toast.success('宗门高层信息已生成');
  } catch (e) {
    console.error('[SectMembers] generate leadership failed', e);
    toast.error('生成失败');
  } finally {
    isGeneratingLeadership.value = false;
  }
}

// 生成同门成员信息
async function generateMembers() {
  if (isGeneratingMembers.value) return;
  const sectName = playerSectName.value;
  if (!sectName || sectName === '未加入宗门') {
    toast.warning('未加入宗门');
    return;
  }
  isGeneratingMembers.value = true;
  try {
    const worldInfo = gameStateStore.worldInfo;
    const sectProfile = (gameStateStore.sectSystem as any)?.宗门档案?.[sectName] ?? null;

    const worldContext = worldInfo ? {
      世界名称: worldInfo.世界名称,
      世界背景: worldInfo.世界背景,
    } : null;


    const prompt = `
# 任务：生成【宗门同门】信息
为宗门「${sectName}」生成同门弟子信息。

## 输出格式
只输出 1 个 JSON 对象：
{"members":[...]}

## member 对象字段
{
  "名字": "string",
  "性别": "男|女",
  "年龄": number（根据职位和境界合理设定，外门弟子15-25岁，内门25-40岁，真传40-80岁，长老80-200岁）,
  "职位": "外门弟子|内门弟子|真传弟子|核心弟子|长老|堂主|峰主|执事|护法|副宗主|宗主（视宗门规模选用）",
  "境界": "string（写具体阶段，如：练气初期、筑基中期、金丹后期）",
  "灵根": "string（如：五行杂灵根、金木双灵根、天灵根等，根据职位合理设定，高职位可有更好灵根）",
  "势力归属": "${sectName}",
  "好感度": number（30-70）
}

## 约束
- 生成 5-10 个同门
- 职位分布合理（外门>内门>真传>长老级）
- 【境界层级约束（严格遵守）】：
  - 宗门整体实力上限由宗门档案中的强度/最强修为决定，以此为天花板
  - 层级规则：太上长老境界 > 宗主境界 > 副宗主境界 > 长老/堂主/峰主境界 > 真传/核心境界 > 内门弟子境界 > 外门弟子境界
  - 禁止低职位境界高于高职位，禁止随意使用超出宗门上限的境界

## 世界背景
${JSON.stringify(worldContext).slice(0, 400)}

## 宗门档案（含宗门强度/最强修为，据此判断境界上限）
${JSON.stringify(sectProfile).slice(0, 800)}
    `.trim();

    const raw = await generateWithRawPrompt('生成同门信息', prompt, false, 'sect_generation');
    const parsed = parseJsonSmart(raw, aiService.isForceJsonEnabled('sect_generation')) as {
      members?: any[];
    };

    if (!Array.isArray(parsed.members)) {
      throw new Error('members 字段缺失');
    }

    // 更新人物关系
    const saveData = gameStateStore.getCurrentSaveData();
    if (saveData) {
      const updated = typeof structuredClone === 'function'
        ? structuredClone(saveData)
        : JSON.parse(JSON.stringify(saveData));

      // 正确路径：社交.关系（与 gameStateStore.loadFromSaveData 一致）
      const socialRoot = ((updated as any).社交 ??= {});
      const relRoot = (socialRoot.关系 ??= {});
      let skippedCount = 0;
      let addedCount = 0;

      for (const m of parsed.members) {
        const name = m.名字;
        if (!name) continue;

        // 关键修复：如果存在同名NPC，则跳过（保留已有剧情和好感关系，防止被覆盖）
        if (relRoot[name]) {
          skippedCount++;
          continue;
        }

        relRoot[name] = {
          ...m,
          宗门: sectName,
        };
        addedCount++;
      }

      gameStateStore.loadFromSaveData(updated);
      await characterStore.saveCurrentGame();

      if (skippedCount > 0) {
        toast.success(`新增了 ${addedCount} 位同门 (跳过 ${skippedCount} 位已有同门)`);
      } else {
        toast.success('同门信息已生成');
      }
    }
    toast.success('同门信息已生成');
  } catch (e) {
    console.error('[SectMembers] generate members failed', e);
    toast.error('生成失败');
  } finally {
    isGeneratingMembers.value = false;
  }
}

// 独立演化成员
async function evolveMember(member: any) {
  if (!playerSectName.value || playerSectName.value === '未加入宗门') return;

  evolvingMembers.value.add(member.id);
  try {
    const sectName = playerSectName.value;
    const sectContext = currentSectFaction.value;
    const worldInfo = gameStateStore.worldInfo;
    const worldContext = worldInfo ? {
      世界名称: worldInfo.世界名称,
      世界背景: worldInfo.世界背景,
    } : null;

    const sectProfile = {
      宗门名称: sectName,
      宗门描述: sectContext?.描述 || '',
      境界分布: sectContext?.境界分布 || '',
      宗主修为: sectLeadership.value?.宗主修为 || '',
      太上长老修为: sectLeadership.value?.太上长老修为 || '',
      最强修为: sectLeadership.value?.最强修为 || '',
    };

    // 获取玩家当前境界（影响基准线）
    const playerRealm = (() => {
      const attrs = gameStateStore.attributes;
      if (!attrs?.境界) return '未知';
      if (typeof attrs.境界 === 'string') return attrs.境界;
      const realm = attrs.境界 as any;
      return `${realm.名称 || ''}${realm.阶段 || ''}`.trim() || '未知';
    })();

    const prompt = `
# 任务：演化【宗门同门】实力
你将为宗门「${sectName}」的已有同门「${member.name}」进行实力演化。

## 输出格式
只输出 1 个 JSON 对象：
{"名字":"${member.name}","职位":"...","境界":"..."}

## 角色基本信息
- 姓名：${member.name}
- 性别：${member.gender}
- 当前职位：${member.position}
- 当前境界：${member.realm}

## 约束
- 根据时间推移和玩家的境界提升，合理演化该角色的职位和境界。如果该角色原本比玩家弱，现在可以适当精进；如果本就远强于玩家（如长老），可能进步较小。
- 【必选职位】：外门弟子|内门弟子|真传弟子|核心弟子|长老|堂主|峰主|执事|护法|副宗主
- 【境界层级约束（严格遵守）】：
  - 宗门整体实力上限由下方的宗门档案中最强修为决定，以此为天花板。
  - 太上长老境界 > 宗主境界 > 副宗主境界 > 长老/堂主/峰主境界 > 真传/核心境界 > 内门弟子境界 > 外门弟子境界，必须随职位匹配。
- 玩家当前境界：${playerRealm}
- "境界"字段只需写具体阶段（如：炼气初期、筑基中期）

## 世界背景
${JSON.stringify(worldContext).slice(0, 400)}

## 宗门档案
${JSON.stringify(sectProfile).slice(0, 600)}
    `.trim();

    const raw = await generateWithRawPrompt('演化同门实力', prompt, false, 'sect_generation');
    const parsed = parseJsonSmart(raw, aiService.isForceJsonEnabled('sect_generation')) as {
      名字?: string;
      职位?: string;
      境界?: string;
    };

    if (!parsed.职位 && !parsed.境界) {
      throw new Error('演化数据缺失');
    }

    // 更新到存档
    const saveData = gameStateStore.getCurrentSaveData();
    if (saveData) {
      const updated = typeof structuredClone === 'function'
        ? structuredClone(saveData)
        : JSON.parse(JSON.stringify(saveData));

      const socialRoot = ((updated as any).社交 ??= {});
      const relRoot = (socialRoot.关系 ??= {});

      const targetNPC = relRoot[member.id];
      if (targetNPC) {
        if (parsed.职位) targetNPC.职位 = parsed.职位;
        if (parsed.境界) targetNPC.境界 = parsed.境界;

        gameStateStore.loadFromSaveData(updated);
        await characterStore.saveCurrentGame();
        toast.success(`「${member.name}」演化完毕`);
      } else {
        throw new Error('找不到目标角色存档');
      }
    }
  } catch (e) {
    console.error('[SectMembers] evolve member failed', e);
    toast.error(`「${member.name}」演化失败`);
  } finally {
    evolvingMembers.value.delete(member.id);
  }
}
</script>

<style scoped>
.sect-members {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 8px;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 我的宗门身份卡片 - 紧凑版 */
.my-sect-identity {
  border: 1px solid rgba(124, 82, 150, 0.25);
  background: linear-gradient(135deg, rgba(124, 82, 150, 0.08), rgba(150, 104, 176, 0.03));
  border-radius: 8px;
  padding: 8px 10px;
  flex-shrink: 0;
}

.identity-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 0.85rem;
  color: #7c5296;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(124, 82, 150, 0.15);
}

.identity-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.identity-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--color-background);
  border-radius: 4px;
  border: 1px solid var(--color-border);
}

.stat-label {
  font-size: 0.7rem;
  color: var(--color-text-secondary);
}

.stat-value {
  font-weight: 600;
  font-size: 0.78rem;
}

.stat-value.sect-name { color: var(--color-text); }
.stat-value.position { color: #7c5296; }
.stat-value.contribution { color: #c69431; }
.stat-value.reputation { color: #4c87ad; }
.stat-value.join-date { color: var(--color-text-secondary); font-size: 0.72rem; }

.identity-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.quick-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  font-size: 0.72rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.quick-action-btn:hover {
  border-color: rgba(76, 135, 173, 0.4);
  background: rgba(76, 135, 173, 0.08);
  color: #4c87ad;
}

.leave-sect-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: transparent;
  border: 1px solid rgba(195, 75, 60, 0.3);
  border-radius: 4px;
  color: #c34b3c;
  font-size: 0.72rem;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-left: auto;
}

.leave-sect-btn:hover {
  background: rgba(195, 75, 60, 0.1);
  border-color: rgba(195, 75, 60, 0.5);
}

.leadership-card {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.leadership-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.leadership-title {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-weight: 700;
  font-size: 0.85rem;
}

.leadership-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.leader-item {
  border: 1px solid var(--color-border);
  background: var(--color-background);
  border-radius: 6px;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
}

.leader-item.primary {
  border-color: rgba(150, 104, 176, 0.35);
  background: rgba(150, 104, 176, 0.06);
}

.leader-item .role {
  font-size: 0.7rem;
  color: var(--color-text-secondary);
}

.leader-item .name {
  font-weight: 700;
  color: var(--color-text);
}

.leader-item .realm {
  font-size: 0.72rem;
  color: var(--color-text-secondary);
}

.leader-item .link {
  border: none;
  background: transparent;
  color: #7c5296;
  cursor: pointer;
  font-size: 0.72rem;
  padding: 0;
  margin-left: 4px;
}

.leader-item .link:hover {
  text-decoration: underline;
}

.leadership-empty {
  color: var(--color-text-secondary);
  font-size: 0.78rem;
}

.ask-btn.small {
  padding: 4px 8px;
  font-size: 0.72rem;
}

.position-leader {
  background: rgba(150, 104, 176, 0.12);
  border-color: rgba(150, 104, 176, 0.35);
  color: #9668b0;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.info-label {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.info-value {
  font-weight: 600;
  font-size: 0.9rem;
}

.info-value.sect-name { color: var(--color-text); }
.info-value.position { color: #7c5296; }

.member-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  flex-shrink: 0;
  align-items: center;
}

.tab-regen-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: transparent;
  border: 1px solid rgba(76, 135, 173, 0.3);
  border-radius: 4px;
  color: #4c87ad;
  font-size: 0.72rem;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-left: auto;
}

.tab-regen-btn:hover:not(:disabled) {
  background: rgba(76, 135, 173, 0.08);
  border-color: rgba(76, 135, 173, 0.5);
}

.tab-regen-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}


.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 4px 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-secondary);
  font-size: 0.72rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  border-color: rgba(76, 135, 173, 0.3);
  color: var(--color-text);
}

.tab-btn.active {
  background: linear-gradient(135deg, rgba(76, 135, 173, 0.1), rgba(37, 99, 235, 0.05));
  border-color: rgba(76, 135, 173, 0.4);
  color: #4c87ad;
}

.count-badge {
  background: #4c87ad;
  color: white;
  font-size: 0.65rem;
  padding: 0 0.3rem;
  border-radius: 8px;
  font-weight: 600;
}

.member-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.empty-state {
  text-align: center;
  padding: 1.5rem;
  color: var(--color-text-secondary);
}

.empty-icon {
  opacity: 0.5;
  margin-bottom: 0.4rem;
}

.empty-text {
  font-weight: 600;
  margin-bottom: 0.2rem;
  font-size: 0.85rem;
}

.empty-hint {
  font-size: 0.75rem;
  opacity: 0.7;
  margin-bottom: 0.75rem;
}

.ask-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.8rem;
  background: linear-gradient(135deg, #4c87ad, #3a6c8c);
  border: none;
  border-radius: 5px;
  color: white;
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.ask-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(76, 135, 173, 0.3);
}

.members {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.member-card {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 6px 8px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.member-card:hover {
  border-color: rgba(76, 135, 173, 0.3);
  background: var(--color-surface);
}

.member-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.evolve-btn {
  background: transparent;
  border: 1px solid rgba(76, 135, 173, 0.3);
  color: #4c87ad;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.72rem;
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: center;
  transition: all 0.2s ease;
  opacity: 0;
}

.member-card:hover .evolve-btn {
  opacity: 0.6;
}

.evolve-btn:hover:not(:disabled) {
  opacity: 1 !important;
  color: #4c87ad;
  background: rgba(76, 135, 173, 0.1);
}

.evolve-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4 !important;
}

.member-card:hover .arrow-icon {
  transform: translateX(2px);
  color: rgba(255, 255, 255, 0.8);
}

.member-card.is-self {
  border-color: rgba(124, 82, 150, 0.3);
  background: linear-gradient(135deg, rgba(124, 82, 150, 0.05), rgba(150, 104, 176, 0.02));
}

.member-avatar {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #7c5296, #70518f);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-text {
  color: white;
  font-weight: 600;
  font-size: 0.85rem;
}

.gender-badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  font-size: 0.55rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-background);
}

.gender-badge.male {
  background: #4c87ad;
  color: white;
}

.gender-badge.female {
  background: #ec4899;
  color: white;
}

.member-info {
  flex: 1;
  min-width: 0;
}

.member-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.15rem;
}

.member-name {
  font-weight: 600;
  color: var(--color-text);
  font-size: 0.82rem;
}

.member-position {
  font-size: 0.65rem;
  padding: 0.05rem 0.3rem;
  border-radius: 3px;
  font-weight: 500;
}

.position-elder { background: rgba(195, 75, 60, 0.1); color: #c34b3c; }
.position-true { background: rgba(138, 111, 168, 0.1); color: #8a6fa8; }
.position-inner { background: rgba(76, 135, 173, 0.1); color: #4c87ad; }
.position-outer { background: rgba(107, 114, 128, 0.1); color: #78736a; }

.member-details {
  display: flex;
  gap: 0.6rem;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  font-size: 0.7rem;
  color: var(--color-text-secondary);
}

.detail-item.realm { color: #8a6fa8; }

.relation-best { color: #ec4899 !important; }
.relation-good { color: #c69431 !important; }
.relation-friendly { color: #5f9b6a !important; }
.relation-normal { color: var(--color-text-secondary) !important; }
.relation-cold { color: #78736a !important; }
.relation-hostile { color: #c34b3c !important; }

.arrow-icon {
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.quick-actions {
  padding: 0.75rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.actions-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.75rem 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text);
}

.action-buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.5rem;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  border-color: rgba(76, 135, 173, 0.3);
  background: rgba(76, 135, 173, 0.05);
  color: #4c87ad;
}

a.leader-item .realm {
  font-size: 0.72rem;
  color: #8a6fa8;
  background: rgba(138, 111, 168, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.hint-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: help;
  color: var(--color-text-secondary);
  margin-left: 2px;
  vertical-align: middle;
}
.hint-icon {
  opacity: 0.7;
}
.hint-wrapper:hover .hint-icon {
  opacity: 1;
  color: var(--color-text);
}

.members-notice {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 4px 8px;
  background: rgba(76, 135, 173, 0.1);
  border-radius: 4px;
  font-size: 0.7rem;
  color: #4c87ad;
  flex-shrink: 0;
}
</style>
