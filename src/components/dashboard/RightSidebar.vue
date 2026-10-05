
<template>
  <div class="right-sidebar">
    <div class="sidebar-header">
      <h3 class="sidebar-title">
        <User :size="18" class="title-icon" />
        <span>{{ t('角色状态') }}</span>
      </h3>
    </div>

    <div v-if="isDataLoaded && characterInfo" class="sidebar-content">
      <!-- 核心数值 -->
      <div class="vitals-section">
        <h3 class="section-title">
          <Heart :size="14" class="section-icon" />
          <span>{{ t('核心数值') }}</span>
        </h3>
        <div class="vitals-list">
          <div class="vital-item">
            <div class="vital-info">
              <span class="vital-name">
                <Droplet :size="12" class="vital-icon blood" />
                <span>{{ t('气血') }}</span>
              </span>
              <span class="vital-text">{{ playerStatus?.气血?.当前 }} / {{ playerStatus?.气血?.上限 }}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill health" :style="{ width: getVitalPercent('气血') + '%' }"></div>
            </div>
          </div>

          <div class="vital-item">
            <div class="vital-info">
              <span class="vital-name">
                <Sparkles :size="12" class="vital-icon mana" />
                <span>{{ t('灵气') }}</span>
              </span>
              <span class="vital-text">{{ playerStatus?.灵气?.当前 }} / {{ playerStatus?.灵气?.上限 }}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill mana" :style="{ width: getVitalPercent('灵气') + '%' }"></div>
            </div>
          </div>

          <div class="vital-item">
            <div class="vital-info">
              <span class="vital-name">
                <Brain :size="12" class="vital-icon spirit" />
                <span>{{ t('神识') }}</span>
              </span>
              <span class="vital-text">{{ playerStatus?.神识?.当前 }} / {{ playerStatus?.神识?.上限 }}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill spirit" :style="{ width: getVitalPercent('神识') + '%' }"></div>
            </div>
          </div>

          <div class="vital-item">
            <div class="vital-info">
              <span class="vital-name">
                <Clock :size="12" class="vital-icon lifespan" />
                <span>{{ t('寿元') }}</span>
              </span>
              <span class="vital-text">{{ currentAge }} / {{ playerStatus?.寿命?.上限 }}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill lifespan" :style="{ width: getLifespanPercent() + '%' }"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 境界状态 -->
      <div class="cultivation-section">
        <h3 class="section-title">
          <Star :size="14" class="section-icon" />
          <span>{{ t('境界状态') }}</span>
        </h3>
        <div class="realm-display">
          <div class="realm-info">
            <span class="realm-name">{{ formatRealmDisplay(playerStatus?.境界) }}</span>
            <span v-if="playerStatus?.境界?.突破描述" class="realm-breakthrough">{{ playerStatus?.境界?.突破描述 }}</span>
          </div>
          <!-- 有进度数据：显示进度条（包含凡人 -> 引气入体） -->
          <div v-if="isRealmProgressAvailable" class="realm-progress">
            <div class="progress-bar">
              <div
                class="progress-fill cultivation"
                :class="getRealmProgressClass()"
                :style="{ width: realmProgressPercent + '%' }"
              ></div>
            </div>
            <span class="progress-text" :class="getRealmProgressClass()">
              {{ realmProgressPercent }}%
              <span v-if="realmProgressPercent >= 100" class="breakthrough-hint">可突破!</span>
              <span v-else-if="realmProgressPercent >= 90" class="sprint-hint">可冲刺</span>
            </span>
          </div>
          <!-- 无进度数据：显示等待提示 -->
          <div v-else class="realm-mortal">
            <span class="mortal-text">{{ realmWaitingText }}</span>
          </div>
        </div>

        <!-- 声望显示 -->
        <div class="reputation-display">
          <div class="reputation-item">
            <div class="reputation-info">
              <span class="reputation-label">
                <Star :size="12" class="vital-icon reputation" />
                <span>{{ t('声望') }}</span>
              </span>
              <span class="reputation-value" :class="getReputationClass()">
                {{ getReputationDisplay() }}
              </span>
            </div>
          </div>
        </div>
      </div>


      <!-- 天赋神通 -->
      <div class="collapsible-section talents-section">
        <div class="section-header" @click="talentsCollapsed = !talentsCollapsed">
          <h3 class="section-title">
            <Star :size="14" class="section-icon gold" />
            <span>{{ t('天赋神通') }}</span>
          </h3>
          <button class="collapse-toggle" :class="{ 'collapsed': talentsCollapsed }">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 10l4-4H4l4 4z"/>
            </svg>
          </button>
        </div>
        <div v-show="!talentsCollapsed" class="talents-list">
          <div class="empty-text" style="margin-bottom:6px;">{{ t('影响演绎与情境判定，不直接改面板数值') }}</div>
          <div
            v-for="talent in characterInfo.天赋"
            :key="typeof talent === 'string' ? talent : talent.name"
            class="talent-card clickable"
            @click="showTalentDetail(typeof talent === 'string' ? talent : talent.name)"
          >
            <div class="talent-header">
              <span class="talent-name">{{ typeof talent === 'string' ? talent : talent.name }}</span>
            </div>
          </div>

          <!-- 空状态显示 -->
          <div v-if="!characterInfo.天赋 || characterInfo.天赋.length === 0" class="empty-talents">
            <div class="empty-text">{{ t('暂无天赋神通') }}</div>
          </div>
        </div>
      </div>

      <!-- 状态效果 -->
      <div class="collapsible-section status-section">
        <div class="section-header" @click="statusCollapsed = !statusCollapsed">
          <h3 class="section-title">
            <Zap :size="14" class="section-icon" />
            <span>{{ t('状态效果') }}</span>
          </h3>
          <button class="collapse-toggle" :class="{ 'collapsed': statusCollapsed }">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 10l4-4H4l4 4z"/>
            </svg>
          </button>
        </div>
        <div v-show="!statusCollapsed" class="status-effects">
          <div v-if="statusEffects.length === 0" class="empty-status">
            <span class="empty-text">{{ t('清净无为') }}</span>
          </div>
          <div v-else class="status-tags-container">
            <div
              v-for="(effect, index) in statusEffects"
              :key="effect.状态名称 || `effect-${index}`"
              class="status-tag clickable"
              :class="[(String(effect.类型 || '').toLowerCase() === 'buff') ? 'buff' : 'debuff']"
              @click="showStatusDetail(effect)"
              :title="`${effect.状态名称 || '未知状态'}${effect.状态描述 ? `\n${effect.状态描述}` : ''}${effect.强度 ? `\n强度: ${effect.强度}` : ''}${formatTimeDisplay(effect.时间) ? `\n${formatTimeDisplay(effect.时间)}` : ''}`"
            >
              <span class="tag-icon">{{ String(effect.类型 || '').toLowerCase() === 'buff' ? t('增') : t('减') }}</span>
              <span class="tag-name">{{ effect.状态名称 || '未知状态' }}</span>
              <span v-if="effect.强度" class="tag-intensity">{{ effect.强度 }}</span>
              <span v-if="formatTimeDisplay(effect.时间)" class="tag-time">{{ formatTimeDisplay(effect.时间) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 任务目标（剧情主线 + 即兴目标；canon_companion 形态，含逐拍/回轨/启程） -->
      <div v-if="!worldMode && (questMain || questGoals.length)" class="collapsible-section quest-section">
        <div class="section-header" @click="questCollapsed = !questCollapsed">
          <h3 class="section-title">
            <Clock :size="14" class="section-icon" />
            <span>{{ t('任务目标') }}</span>
          </h3>
          <button class="collapse-toggle" :class="{ 'collapsed': questCollapsed }">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 10l4-4H4l4 4z"/>
            </svg>
          </button>
        </div>
        <div v-show="!questCollapsed" class="quest-body">
          <div v-if="questMain" class="quest-main">
            <div v-if="questMain.chapter" class="quest-chapter"><span class="quest-tag quest-tag-main">主线</span>{{ questMain.chapter }}</div>
            <div v-for="ev in questMain.events" :key="ev" class="quest-event"><span class="quest-mark-main">◆</span>{{ ev }}</div>
            <div v-if="questMain.moreCount > 0" class="quest-more">{{ t('本关后续还有') }} {{ questMain.moreCount }} {{ t('个节点') }}</div>
            <div v-if="questMain.stalled" class="quest-stall-warn" style="color:#e6a23c;font-size:12px;margin-top:4px;line-height:1.4;">⚠️ 主线疑似脱节（已停滞 {{ questMain.stallCount }} 轮）——剧情可能已跑到主线前面，系统将自动尝试事件对账修复（可在 API 管理·事件对账 中关闭）</div>
            <div v-if="questMain.signal?.level === 'medium' || questMain.signal?.level === 'high'" class="quest-stall-warn" style="color:#e6a23c;font-size:12px;margin-top:4px;line-height:1.4;">
              世界线偏离：{{ questMain.signal.level === 'high' ? '大偏' : '中偏' }}（{{ questMain.signal.score }}/100）。你可以继续当前支流，也可以主动回到最近承重节点。
            </div>
            <button v-if="questMain.canReturn && !epistemicRuntime?.gameOver && !detectBranchDecision(getCurrentStoryEventActions(gameStateStore.toSaveData()))" class="quest-next-btn" :disabled="returningToCanon" @click="cutBackToCanon">
              {{ returningToCanon ? t('回轨中…') : t('↩ 斩线回轨') }}
            </button>
            <div v-if="questMain.cleared" class="quest-cleared">✅ {{ t('本关剧情已完成') }}</div>
            <template v-if="questMain.next">
              <div class="quest-next">{{ t('此地诸事已暂告一段落。若已准备好，可顺势启程。') }}</div>
              <button class="quest-next-btn" :disabled="stageSwitching || uiStore.isAIProcessing" @click="goNextStage">
                {{ stageSwitching ? t('启程中…') : t('▶ 启程') }}
              </button>
              <div v-if="stageSwitchError" class="quest-error">{{ stageSwitchError }}</div>
            </template>
          </div>
          <div v-if="questGoals.length" class="quest-improv">
            <div class="quest-improv-label"><span class="quest-tag quest-tag-side">个人</span>{{ t('个人目标（可选）') }}</div>
            <div v-for="(g, i) in questGoals" :key="i" class="quest-goal"><span class="quest-mark-side">·</span>{{ g }}</div>
          </div>
        </div>
      </div>

      <!-- 任务目标（world_sim：长期方向 + 本关主轴节点 + 当前可切入点；不催、不逐拍、无回轨/启程） -->
      <div v-if="worldMode && worldQuestAxis" class="collapsible-section quest-section">
        <div class="section-header" @click="questCollapsed = !questCollapsed">
          <h3 class="section-title">
            <Clock :size="14" class="section-icon" />
            <span>{{ t('任务目标') }}</span>
          </h3>
          <button class="collapse-toggle" :class="{ 'collapsed': questCollapsed }">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 10l4-4H4l4 4z"/>
            </svg>
          </button>
        </div>
        <div v-show="!questCollapsed" class="quest-body">
          <div class="quest-main">
            <div class="quest-chapter">
              <span class="quest-tag quest-tag-main">主线</span>{{ worldQuestAxis.direction }}
            </div>
            <div v-if="worldQuestAxis.nodes" class="quest-event">
              <span class="quest-mark-main">◆</span>{{ t('当前主轴目标') }}：{{ worldQuestAxis.nodes }}
            </div>
            <div v-if="worldQuestAxis.entry" class="quest-event">
              <span class="quest-mark-main">◆</span>{{ t('当前可切入点') }}：{{ worldQuestAxis.entry }}
            </div>
            <div class="quest-more">{{ t('可无限期搁置，无进度惩罚') }}</div>
          </div>
        </div>
      </div>

      <!-- 人物任务：这一拍因为谁而不一样；空则整块不渲染 -->
      <div v-if="characterBeats.length" class="collapsible-section quest-section">
        <div class="section-header" @click="beatsCollapsed = !beatsCollapsed">
          <h3 class="section-title">
            <Clock :size="14" class="section-icon" />
            <span>{{ t('这一拍谁有戏') }}</span>
          </h3>
          <button class="collapse-toggle" :class="{ 'collapsed': beatsCollapsed }">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 10l4-4H4l4 4z"/></svg>
          </button>
        </div>
        <div v-show="!beatsCollapsed" class="quest-body">
          <div class="quest-main">
            <div v-for="(beat, i) in characterBeats" :key="`${beat.name}-${i}`" class="quest-event">
              <span class="quest-mark-side">·</span>{{ beat.name }}——{{ beat.objective }}
            </div>
          </div>
        </div>
      </div>

      <!-- 玩家认知与路径：只展示引擎已落账内容，不从叙事猜测事实 -->
      <EpistemicLedgerPanel
        :runtime="epistemicRuntime"
        :player-knowledge="epistemicRuntime?.playerKnowledge"
        :path-receipts="epistemicRuntime?.pathReceipts"
      />

      <!-- 二级线待办：走到地方／认识对的人就出现，不需要接受任务 -->
      <div v-if="availableLines.length" class="collapsible-section quest-section">
        <div class="section-header" @click="linesCollapsed = !linesCollapsed">
          <h3 class="section-title">
            <Clock :size="14" class="section-icon" />
            <span>{{ t('可投的门路') }}</span>
          </h3>
          <button class="collapse-toggle" :class="{ 'collapsed': linesCollapsed }">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 10l4-4H4l4 4z"/></svg>
          </button>
        </div>
        <div v-show="!linesCollapsed" class="quest-body">
          <div v-for="line in availableLines" :key="line.id" class="quest-main">
            <div class="quest-chapter">
              <span class="quest-tag quest-tag-side">{{ line.kind }}</span>{{ line.name }}
            </div>
            <div class="quest-event"><span class="quest-mark-side">·</span>{{ line.hint }}</div>
            <div v-if="line.objective" class="quest-event"><span class="quest-mark-main">◆</span>{{ t('当前目标') }}：{{ line.objective }}</div>
          </div>
          <div class="quest-more">{{ t('照着做就是加入，不做也不损失什么。') }}</div>
        </div>
      </div>

      <!-- 世界演员：角色先行动，玩家可选择是否介入 -->
      <div v-if="actorView" class="collapsible-section quest-section actor-section">
        <div class="section-header" @click="actorCollapsed = !actorCollapsed">
          <h3 class="section-title">
            <Sparkles :size="14" class="section-icon gold" />
            <span>{{ worldMode ? t('当前局势') : t('世界正在行动') }}</span>
          </h3>
          <button class="collapse-toggle" :class="{ 'collapsed': actorCollapsed }">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 10l4-4H4l4 4z"/>
            </svg>
          </button>
        </div>
        <div v-show="!actorCollapsed" class="quest-body">
          <div v-if="actorView.pressure" class="actor-pressure">{{ actorView.pressure }}</div>
          <div v-for="decision in actorView.decisions" :key="decision.id" class="actor-signal">
            <span class="quest-mark-main">◆</span>
            <span><strong>{{ decision.actorName }}</strong>：{{ decision.signal }}</span>
          </div>
          <div v-if="actorView.pendingDivergence" class="actor-card actor-pending-divergence">
            <div class="actor-card-title">本地行动已触及世界线分叉</div>
            <div class="actor-card-line"><span>变化</span>{{ actorView.pendingDivergence.worldDelta }}</div>
            <div class="actor-card-risk">确认后将激活正式 IF；仍保留本段承重锚点。若默认结果已先行结算，确认会被拒绝。</div>
            <button class="quest-next-btn" :disabled="worldDivergenceBusy" @click="confirmWorldDivergence">确认这条世界线</button>
            <button class="quest-next-btn" :disabled="worldDivergenceBusy" @click="cancelWorldDivergence">保留默认未来</button>
          </div>
          <div v-for="intervention in actorView.interventions" :key="intervention.id" class="actor-card">
            <div class="actor-card-title">可分叉介入 · {{ intervention.label }}</div>
            <div class="actor-card-line"><span>门槛</span>本地 {{ intervention.kind === 'combat' ? '战斗' : '疗伤' }}判定；成功后仍须确认 IF</div>
            <button class="quest-next-btn" @click="prefillWorldIntervention(intervention.actionText)">采用这项做法</button>
          </div>
          <div v-for="card in actorView.opportunities" :key="card.id" class="actor-card">
            <div class="actor-card-title">{{ card.title }}</div>
            <div class="actor-card-line"><span>现在</span>{{ card.whyNow }}</div>
            <div class="actor-card-line"><span>下一步</span>{{ card.nextStep }}</div>
            <div v-if="card.progressTotal" class="actor-card-line">
              <span>进度</span>{{ card.progressCurrent }}/{{ card.progressTotal }}<template v-if="card.currentStep"> · {{ card.currentStep }}</template>
            </div>
            <div v-if="card.windowText && !worldMode" class="actor-card-line" :class="{ 'actor-window-tight': card.windowTight }">
              <span>时间</span>{{ card.windowText }}
            </div>
            <div class="actor-card-line"><span>可能获得</span>{{ card.rewardPreview }}</div>
            <div class="actor-card-risk">风险：{{ card.stakes }}</div>
            <button
              class="quest-next-btn"
              :disabled="trackingOpportunity === card.id || actorView.trackedId === card.id"
              @click="trackOpportunity(card.id)"
            >
              {{ actorView.trackedId === card.id ? t('✓ 已追踪') : trackingOpportunity === card.id ? t('追踪中…') : t('追踪此机会') }}
            </button>
          </div>
          <div v-if="actorView.opportunities.length" class="actor-ignore">{{ t('也可暂不介入；世界会继续推进，不会伪记为你亲历。') }}</div>
          <div v-for="receipt in actorView.receipts" :key="receipt.id" class="actor-receipt">
            {{ receipt.outcome === 'participated' ? '✓' : receipt.outcome === 'partial' ? '◐' : '◇' }} {{ receipt.title }}：{{ receipt.detail }}
          </div>
          <div v-for="permission in actorView.entitlements" :key="permission.key" class="actor-permission">
            已解锁：{{ permission.label }}
          </div>
          <div v-for="receipt in actorView.simulationReceipts" :key="receipt.id" class="actor-receipt">
            ◇ 世界介入：{{ receipt.detail }}
          </div>
          <div v-if="stageSwitchError" class="quest-error">{{ stageSwitchError }}</div>
        </div>
      </div>

      <!-- 世界线记录：先由正文呈现后果，这里只留可回看的变化凭据 -->
      <div v-if="worldlineEntries.length" class="collapsible-section quest-section">
        <div class="section-header" @click="worldlineCollapsed = !worldlineCollapsed">
          <h3 class="section-title">
            <Clock :size="14" class="section-icon gold" />
            <span>{{ t('世界线记录') }}</span>
          </h3>
          <button class="collapse-toggle" :class="{ 'collapsed': worldlineCollapsed }">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 10l4-4H4l4 4z"/>
            </svg>
          </button>
        </div>
        <div v-show="!worldlineCollapsed" class="quest-body">
          <div v-for="entry in worldlineEntries" :key="entry.id" class="quest-event">
            <span class="quest-mark-main">◇</span>
            <span>{{ entry.worldDelta }}<template v-if="entry.receipt">（{{ entry.receipt }}）</template></span>
          </div>
        </div>
      </div>

      <div v-if="chronicleEntries.length" class="collapsible-section quest-section">
        <div class="section-header" @click="chronicleCollapsed = !chronicleCollapsed">
          <h3 class="section-title">
            <Star :size="14" class="section-icon gold" />
            <span>{{ t('战役编年史') }}</span>
          </h3>
          <button class="collapse-toggle" :class="{ 'collapsed': chronicleCollapsed }">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 10l4-4H4l4 4z"/>
            </svg>
          </button>
        </div>
        <div v-show="!chronicleCollapsed" class="quest-body">
          <div v-for="entry in chronicleEntries" :key="entry.id" class="quest-event">
            <span class="quest-mark-main">{{ entry.mark }}</span>
            <span>{{ entry.title }}<template v-if="entry.detail">：{{ entry.detail }}</template></span>
          </div>
        </div>
      </div>
    </div>

    <!-- 无角色数据 -->
    <div v-else class="no-character">
      <div class="no-char-text">{{ t('请选择角色开启修仙之旅') }}</div>
    </div>

    <!-- 详情模态框 -->
    <DetailModal />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { User, Sparkles, Heart, Droplet, Brain, Clock, Star, Zap } from 'lucide-vue-next';
import { LOCAL_TALENTS } from '@/data/creationData';
import DetailModal from '@/components/common/DetailModal.vue';
import StatusDetailCard from './components/StatusDetailCard.vue';
import EpistemicLedgerPanel from './components/EpistemicLedgerPanel.vue';
import { useGameStateStore } from '@/stores/gameStateStore';
import { useUIStore } from '@/stores/uiStore';
import type { StatusEffect } from '@/types/game.d.ts';
import { formatRealmWithStage } from '@/utils/realmUtils';
import { calculateAgeFromBirthdate } from '@/utils/lifespanCalculator';
import {
  getScenarioFocusEvent,
  getCurrentStoryEventActions,
  getStageDepartureOffer,
  trackStoryOpportunity,
  TRACKED_OPPORTUNITY_MAX_TURNS,
} from '@/modules/scenarioMods/runtime';
import {
  cancelWorldSimulationDivergence,
  confirmWorldSimulationDivergence,
  getCurrentWorldSituation,
  isWorldSimulationRuntime,
} from '@/modules/scenarioMods/worldSimulation';
import { resolveCurrentMainQuestNode, resolveMainQuestLayer } from '@/modules/scenarioMods/mainQuestAxis';
import { secondaryLineDisplayName, resolveAvailableLines, secondaryLinesAtEvent } from '@/modules/scenarioMods/secondaryLines';
import { locationFromPosition } from '@/modules/scenarioMods/travel/travelLedger';
import { characterBeatsAt } from '@/modules/scenarioMods/characterQuests';
import { prefillChat } from '@/utils/chatBus';
import { formatQuestCompass, resolveScenarioEventNarrative, storyChapterTitle } from '@/modules/scenarioMods/eventNarrativeView';
import { detectBranchDecision } from '@/modules/scenarioMods/branchDecision';
import { returnToCanonAnchor } from '@/modules/scenarioMods/divergenceControl';
import { useI18n } from '@/i18n';

const { t } = useI18n();


const gameStateStore = useGameStateStore();
const uiStore = useUIStore();

// 数据加载状态
const isDataLoaded = computed(() => gameStateStore.isGameLoaded && !!gameStateStore.character);

// 直接使用中文字段访问数据
const characterInfo = computed(() => gameStateStore.character);
const playerStatus = computed(() => gameStateStore.attributes);
const statusEffects = computed(() => {
  const effects = gameStateStore.effects || [];
  // 🔥 过滤掉无效的状态效果（undefined、null或缺少状态名称）
  return effects.filter((effect): effect is StatusEffect =>
    effect != null && typeof effect === 'object' && '状态名称' in effect
  );
});

const questCollapsed = ref(false);
const linesCollapsed = ref(false);
const beatsCollapsed = ref(false);
const worldlineCollapsed = ref(false);
const chronicleCollapsed = ref(true);
const actorCollapsed = ref(false);
const stageSwitching = ref(false);
const stageSwitchError = ref('');
const returningToCanon = ref(false);
const trackingOpportunity = ref('');
const worldDivergenceBusy = ref(false);
const epistemicRuntime = computed(() => (gameStateStore.worldState as any)?.剧本模组);
const worldMode = computed(() => isWorldSimulationRuntime(epistemicRuntime.value));
const currentQuestEvent = (rt: any): any => {
  const sourceEventId = getCurrentWorldSituation(rt)?.sourceEventId;
  return (sourceEventId && (rt.events || []).find((event: any) => event?.id === sourceEventId))
    || getScenarioFocusEvent(rt);
};
const playerLocationDescription = (): string => String(gameStateStore.location?.描述 || '');
const questAtLocationId = (rt: any): string | undefined => locationFromPosition(
  playerLocationDescription(),
  rt?.canon?.locations,
).locationId;
const visibleQuestObjective = (rt: any, event: any): string => {
  if (!event) return '';
  const view = resolveScenarioEventNarrative(event, rt.flags || {}, rt.divergences, rt);
  return formatQuestCompass(view, rt, questAtLocationId(rt)) || String(view.objective || '').trim();
};
// world_sim 主线轴：长期方向（当前层）+ 本关节点 + 局势源事件 objective；不含层六、无逐拍列表。
const worldQuestAxis = computed(() => {
  if (!worldMode.value) return null;
  const rt: any = epistemicRuntime.value;
  if (!rt || typeof rt !== 'object') return null;
  const layer = resolveMainQuestLayer(rt.modId);
  if (!layer?.text) return null;
  // 当前地点：隔离关被默认路线跳过时，节点靠地点锚仍要显示（见 MainQuestNode.locationId）。
  // 存档里存的是中文描述串，按地点名做最长匹配还原成 id——与 storyContext 的解析同口径。
  const curLocId = locationFromPosition(playerLocationDescription(), rt.canon?.locations).locationId;
  const event = currentQuestEvent(rt);
  const objective = visibleQuestObjective(rt, event);
  const mainNode = resolveCurrentMainQuestNode(rt.modId, curLocId, event?.id);
  return {
    direction: layer.text,
    // 同关未来节点的 reviewSummary 不再提前摊给玩家；只显示当前 event 的固定 objective。
    nodes: mainNode ? objective : '',
    entry: mainNode ? '' : objective,
  };
});
// 二级线：锚一满足就作为待办显示，不需要玩家确认（用户裁定 2026-08-16）。
const availableLines = computed(() => {
  const rt: any = epistemicRuntime.value;
  if (!rt || typeof rt !== 'object') return [];
  const locId = locationFromPosition(
    playerLocationDescription(),
    rt.canon?.locations,
  ).locationId;
  const event = currentQuestEvent(rt);
  const activeLineIds = new Set(secondaryLinesAtEvent(event?.id).map(line => line.id));
  return resolveAvailableLines(locId, rt.acquaintances, rt.completedEventIds).map((line: any) => ({
    id: line.id,
    name: secondaryLineDisplayName(line, event),
    kind: line.kind === 'sect'
      ? '宗派'
      : line.kind === 'commerce'
        ? '商道'
        : line.kind === 'expedition'
          ? '远征'
          : '国家',
    hint: line.entryHint,
    objective: activeLineIds.has(line.id) ? visibleQuestObjective(rt, event) : '',
  }));
});
// 人物任务：只问当前这一拍因为谁而不一样。事件 id 走 getScenarioFocusEvent，
// 与主线 UI / 主叙事同一锚，避免从 activeEventIds 抽出资料事件。
const characterBeats = computed(() => {
  const rt: any = epistemicRuntime.value;
  if (!rt || typeof rt !== 'object') return [];
  const event = currentQuestEvent(rt);
  const objective = visibleQuestObjective(rt, event);
  if (!objective) return [];
  return characterBeatsAt(event?.id).map(beat => ({ name: beat.name, objective }));
});
// 剧情主线：章节/活跃事件/清关状态/下一关（确定性，读 worldState.剧本模组）
const questMain = computed(() => {
  const rt: any = (gameStateStore.worldState as any)?.剧本模组;
  if (!rt || typeof rt !== 'object') return null;
  const focusId = getScenarioFocusEvent(rt)?.id;
  const chapter = (rt.chapters || []).find((c: any) => focusId && c.eventIds?.includes(focusId))
    || (rt.chapters || []).find((c: any) => c.id === rt.currentChapterId);
  // 与主叙事/flag guard 共用同一个运行时锚点，避免 UI 单独从 activeEventIds 选出资料事件。
  const anchor = getScenarioFocusEvent(rt);
  const activeEvents = anchor ? [anchor] : [];
  const events = activeEvents.slice(0, 1).map((e: any) => {
    const view = resolveScenarioEventNarrative(e, rt.flags || {}, rt.divergences, rt);
    return formatQuestCompass(view, rt, questAtLocationId(rt)) || view.objective || view.name;
  }).filter(Boolean);
  const moreCount = Math.max(0, activeEvents.length - 1);
  const ready = rt.nextStageReadyId && rt.nextStageReadyId === rt.nextStageId;
  const departure = ready ? getStageDepartureOffer(gameStateStore.toSaveData()) : null;
  if (departure?.label && !events.length) events.push(departure.label);
  const cleared = ready && !chapter && !events.length;
  const next = Boolean(departure);
  // 脱节哨兵（零成本确定性）：停滞轮数超阈值 → UI 预警"主线疑似脱节"，只提示、不改任何数据。
  // 阈值 10 高于强引子(7)，避免正常卡关误报；治本对齐仍靠进度审计对账。
  const stallTurns = Number(rt.stallTurns) || 0;
  const stalled = stallTurns >= 10;
  if (!chapter && !events.length && !next && !stalled) return null;
  const signal = rt.divergenceSignal;
  const canReturn = signal?.level === 'medium' || signal?.level === 'high' || stalled;
  return {
    chapter: chapter ? `章节：${storyChapterTitle(rt.modId, anchor?.id, chapter.title || chapter.id)}` : '',
    events,
    moreCount,
    cleared,
    next,
    nextStageId: next ? String(rt.nextStageReadyId) : '',
    stalled,
    stallCount: stallTurns,
    signal,
    canReturn,
  };
});
const actorView = computed(() => {
  const rt: any = (gameStateStore.worldState as any)?.剧本模组;
  if (!rt || typeof rt !== 'object') return null;
  const anchor: any = getScenarioFocusEvent(rt);
  const contract = anchor?.worldActor;
  const engine = rt.actorEngine || {};
  const receipts = Array.isArray(engine.receipts) ? engine.receipts.slice(-3).reverse() : [];
  const entitlements = Array.isArray(engine.entitlements) ? engine.entitlements.slice(-3).reverse() : [];
  if (!contract && !receipts.length && !entitlements.length) return null;
  const names = new Map((rt.canon?.characters || []).map((character: any) => [character.id, character.name]));
  const visibleIds = new Set(Array.isArray(engine.visibleDecisionIds) ? engine.visibleDecisionIds : []);
  const decisions = Array.isArray(engine.decisions)
    ? engine.decisions.filter((item: any) => visibleIds.has(item.id)).map((item: any) => ({
      id: String(item.id || ''),
      actorName: String(names.get(item.actorId) || item.actorId || ''),
      signal: String(item.visibleSignal || item.label || ''),
    }))
    : [];
  const agenda = contract?.agendas?.find((item: any) => item.id === engine.activeAgendaId) || contract?.agendas?.[0];
  if (!decisions.length && agenda) {
    decisions.push({
      id: String(agenda.id || ''),
      actorName: String(names.get(agenda.characterId) || ''),
      signal: String(agenda.visibleSignal || ''),
    });
  }
  const situation = getCurrentWorldSituation(rt);
  const situationOutcomes = new Set(situation?.outcomeIds || []);
  const interventions = worldMode.value && !rt.worldSimulationState?.pendingDivergence
    ? (rt.worldSimulation?.forkableOutcomes || [])
      .filter((outcome: any) => situationOutcomes.has(outcome.id))
      .flatMap((outcome: any) => (outcome.replacementBranches || []).map((branch: any) => branch.intervention))
      .filter(Boolean)
    : [];
  return {
    pressure: String(contract?.pressure?.summary || ''),
    decisions,
    interventions,
    pendingDivergence: rt.worldSimulationState?.pendingDivergence || null,
    simulationReceipts: Array.isArray(rt.worldSimulationState?.actionReceipts)
      ? rt.worldSimulationState.actionReceipts.slice(-3).reverse()
      : [],
    opportunities: Array.isArray(contract?.opportunities)
      ? contract.opportunities
        .filter((item: any) =>
          !engine.opportunityStates
          || ['available', 'tracked'].includes(String(engine.opportunityStates[item.id]?.status || '')))
        .map((item: any) => {
          const opportunityState = engine.opportunityStates?.[item.id] || {};
          const contractSteps = item.completionContract?.steps || [];
          const progressCurrent = Math.max(0, Number(opportunityState.completionStepIndex) || 0);
          const remainingSteps = Math.max(0, contractSteps.length - progressCurrent);
          const currentStep = contractSteps[progressCurrent]?.label || '';
          const turn = Math.max(0, Number(rt.worldTurn) || 0);
          const timelineState = rt.eventTimeline?.[anchor?.id];
          const deadlineTurns = Number(anchor?.timeline?.deadlineTurns);
          const deadlineRemaining = Number.isFinite(deadlineTurns) && timelineState
            ? Math.max(0, Number(timelineState.eligibleAtTurn) + deadlineTurns - turn)
            : undefined;
          const persistent = item.completionContract?.expiry === 'persistent';
          const trackedRemaining = !persistent && opportunityState.status === 'tracked'
            && opportunityState.trackedAtTurn !== undefined
            ? Math.max(0, TRACKED_OPPORTUNITY_MAX_TURNS - (turn - Number(opportunityState.trackedAtTurn)))
            : undefined;
          const availableRemaining = !persistent && opportunityState.status === 'available'
            && item.expiresAfterTurns !== undefined
            ? Math.max(0, Number(item.expiresAfterTurns) - (turn - Number(opportunityState.surfacedAtTurn || turn)))
            : undefined;
          const candidates = [deadlineRemaining, trackedRemaining, availableRemaining]
            .filter((value): value is number => value !== undefined);
          const remainingTurns = candidates.length ? Math.min(...candidates) : undefined;
          const windowText = remainingTurns === undefined
            ? (persistent ? '无硬截止，可自行安排' : '')
            : remainingTurns <= 0
              ? '窗口已到截止'
              : remainingTurns === 1
                ? '最后 1 次重要行动'
                : `预计还可进行 ${remainingTurns} 次重要行动${remainingTurns < remainingSteps ? '，已不足以完整兑现' : ''}`;
          return {
            ...item,
            progressCurrent,
            progressTotal: contractSteps.length,
            currentStep,
            windowText,
            windowTight: remainingTurns !== undefined && remainingTurns <= Math.max(1, remainingSteps),
          };
        })
        .slice(0, 2)
      : [],
    trackedId: engine.anchorEventId === anchor?.id ? String(engine.trackedOpportunityId || '') : '',
    receipts,
    entitlements,
  };
});
const prefillWorldIntervention = (actionText: string) => prefillChat(actionText, true);
const confirmWorldDivergence = async () => {
  if (worldDivergenceBusy.value) return;
  worldDivergenceBusy.value = true;
  stageSwitchError.value = '';
  try {
    const save = gameStateStore.toSaveData();
    if (!save) throw new Error('存档数据不完整');
    const result = confirmWorldSimulationDivergence(save);
    if (!result.ok) throw new Error(result.reason || '世界线确认失败');
    gameStateStore.loadFromSaveData(save);
    await gameStateStore.saveGame();
  } catch (error) {
    stageSwitchError.value = String((error as Error)?.message || error);
  } finally {
    worldDivergenceBusy.value = false;
  }
};
const cancelWorldDivergence = async () => {
  if (worldDivergenceBusy.value) return;
  worldDivergenceBusy.value = true;
  stageSwitchError.value = '';
  try {
    const save = gameStateStore.toSaveData();
    if (!save) throw new Error('存档数据不完整');
    const result = cancelWorldSimulationDivergence(save);
    if (!result.ok) throw new Error(result.reason || '世界线取消失败');
    gameStateStore.loadFromSaveData(save);
    await gameStateStore.saveGame();
  } catch (error) {
    stageSwitchError.value = String((error as Error)?.message || error);
  } finally {
    worldDivergenceBusy.value = false;
  }
};
const trackOpportunity = async (opportunityId: string) => {
  if (trackingOpportunity.value) return;
  trackingOpportunity.value = opportunityId;
  stageSwitchError.value = '';
  try {
    const save = gameStateStore.toSaveData();
    if (!save) throw new Error('存档数据不完整');
    const result = trackStoryOpportunity(save, opportunityId);
    if (!result.ok) throw new Error(result.reason || '当前机会已失效');
    gameStateStore.loadFromSaveData(save);
    await gameStateStore.saveGame();
  } catch (error) {
    stageSwitchError.value = String((error as Error)?.message || error);
  } finally {
    trackingOpportunity.value = '';
  }
};
const goNextStage = async () => {
  if (stageSwitching.value) return;
  stageSwitching.value = true;
  stageSwitchError.value = '';
  try {
    const result = await gameStateStore.transitionToNextStage(questMain.value?.nextStageId || undefined);
    if (!result.ok) stageSwitchError.value = result.reason || '切换失败';
  } catch (error) {
    stageSwitchError.value = String((error as Error)?.message || error);
  } finally {
    stageSwitching.value = false;
  }
};
const cutBackToCanon = async () => {
  if (returningToCanon.value) return;
  returningToCanon.value = true;
  stageSwitchError.value = '';
  try {
    const save = gameStateStore.toSaveData();
    if (!save) throw new Error('存档数据不完整');
    const result = returnToCanonAnchor(save);
    if (!result.ok) throw new Error(result.reason || '当前无法回轨');
    gameStateStore.loadFromSaveData(save);
    await gameStateStore.saveGame();
  } catch (error) {
    stageSwitchError.value = String((error as Error)?.message || error);
  } finally {
    returningToCanon.value = false;
  }
};
// 即兴目标（LLM 维护的跨轮任务槽，上限 3）
const questGoals = computed(() => {
  const goals: any = (gameStateStore.systemExtensions as any)?.任务追踪?.即兴目标;
  if (!Array.isArray(goals)) return [] as string[];
  return goals.slice(0, 3).map((g: any) => typeof g === 'string' ? g : g?.标题 || '').filter(Boolean);
});
const worldlineEntries = computed(() => {
  const rt: any = (gameStateStore.worldState as any)?.剧本模组;
  if (!Array.isArray(rt?.divergences)) return [] as Array<{ id: string; worldDelta: string; receipt: string }>;
  const names = new Map((rt?.canon?.characters || []).map((character: any) => [character.id, character.name]));
  const statusText: Record<string, string> = {
    alive: '生还', dead: '死亡', longrest: '长养', incapacitated: '失能', missing: '失踪',
  };
  return rt.divergences.slice(-5).reverse()
    .filter((item: any) => item && item.revealed !== false && typeof item.worldDelta === 'string')
    .map((item: any, index: number) => ({
      id: String(item.id || `divergence-${index}`),
      worldDelta: item.worldDelta,
      receipt: Array.isArray(item.characterStates)
        ? item.characterStates.map((state: any) => {
          const name = names.get(state.characterId) || String(state.characterId || '').split('.').at(-1);
          return `${name}：${statusText[String(state.status || '').toLowerCase()] || state.status}`;
        }).filter(Boolean).join('、')
        : '',
    }));
});
const chronicleEntries = computed(() => {
  const rt: any = (gameStateStore.worldState as any)?.剧本模组;
  if (!Array.isArray(rt?.chronicle)) return [] as Array<{ id: string; mark: string; title: string; detail: string }>;
  // 旧试玩档可能已经把同一 worldDelta 同时记为“来报”与“世界自行推进”。
  // 展示层按正文去重，并优先保留符合玩家认知时点的事后消息条目。
  const deduped = new Map<string, any>();
  for (const item of rt.chronicle.slice(-16)) {
    if (!item || typeof item.title !== 'string') continue;
    const key = typeof item.detail === 'string' && item.detail.trim()
      ? item.detail.trim()
      : String(item.id || item.title);
    const previous = deduped.get(key);
    const isReport = item.id?.endsWith('.revealed') || item.title === '消息传来' || item.title === '来报' || /急报|密报|来报/.test(item.title);
    const previousIsReport = previous && (previous.id?.endsWith('.revealed') || previous.title === '消息传来' || previous.title === '来报' || /急报|密报|来报/.test(previous.title));
    if (!previous || (isReport && !previousIsReport)) deduped.set(key, item);
  }
  return [...deduped.values()]
    .sort((left: any, right: any) => Number(right.sequence || 0) - Number(left.sequence || 0))
    .slice(0, 8)
    .filter((item: any) => item && typeof item.title === 'string')
    .map((item: any, index: number) => ({
      id: String(item.id || `chronicle-${index}`),
      mark: item.type === 'stage' ? '◆' : item.type === 'world' ? '◇' : '·',
      title: String(item.title),
      detail: typeof item.detail === 'string' ? item.detail : '',
    }));
});

// 自动计算当前年龄（基于出生日期）
const currentAge = computed(() => {
  const birthdate = characterInfo.value?.出生日期;
  const gameTime = gameStateStore.gameTime;

  if (birthdate && gameTime) {
    return calculateAgeFromBirthdate(birthdate, gameTime);
  }

  // 兜底：返回寿命当前值
  return gameStateStore.attributes?.寿命?.当前 || 0;
});

// 收缩状态
const talentsCollapsed = ref(false);
const statusCollapsed = ref(false);

// 模态框状态（通过 uiStore 管理，不再需要本地状态）

// 时间显示格式化
const formatTimeDisplay = (time: string | undefined): string => {
  if (!time || time === '未指定') return '';
  if (time === '永久') return '永久';

  // 处理数字形式的时间（分钟）
  if (/^\d+$/.test(time)) {
    const minutes = parseInt(time);
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}时${mins}分` : `${hours}时`;
    }
    return `${minutes}分钟`;
  }

  return time;
};



// 计算百分比的工具方法
const realmProgressPercent = computed(() => {
  if (!gameStateStore.attributes?.境界) return 0;
  const progress = gameStateStore.attributes.境界.当前进度;
  const maxProgress = gameStateStore.attributes.境界.下一级所需;
  if (!maxProgress || maxProgress <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((progress / maxProgress) * 100)));
});

const isRealmProgressAvailable = computed(() => {
  const maxProgress = gameStateStore.attributes?.境界?.下一级所需;
  return typeof maxProgress === 'number' && maxProgress > 0;
});

const realmWaitingText = computed(() => {
  const desc = playerStatus.value?.境界?.突破描述;
  if (desc) return `${t('等待仙缘')} · ${desc}`;
  return t('等待仙缘');
});

// 根据进度百分比返回CSS类名
const getRealmProgressClass = (): string => {
  const percent = realmProgressPercent.value;
  if (percent >= 100) return 'realm-breakthrough';  // 红色 - 可突破
  if (percent >= 90) return 'realm-sprint';         // 黄色 - 可冲刺
  return '';                                         // 紫色 - 默认
};

// 计算生命体征百分比
const getVitalPercent = (type: '气血' | '灵气' | '神识') => {
  if (!gameStateStore.attributes) return 0;
  const vital = (gameStateStore.attributes as any)[type];
  if (!vital?.当前 || !vital?.上限) return 0;
  return Math.round((vital.当前 / vital.上限) * 100);
};

// 计算寿命百分比（使用计算后的年龄）
const getLifespanPercent = () => {
  const maxLifespan = gameStateStore.attributes?.寿命?.上限;
  if (!maxLifespan) return 0;
  return Math.round((currentAge.value / maxLifespan) * 100);
};

// 获取天赋数据
const getTalentData = (talent: string): any => {
  // 从角色身份信息（V3：gameStateStore.character）的天赋列表中查找
  const baseInfoValue = gameStateStore.character;
  if (baseInfoValue?.天赋 && Array.isArray(baseInfoValue.天赋)) {
    const talentDetail = baseInfoValue.天赋.find((t: any) => t.名称 === talent);
    if (talentDetail) {
      return talentDetail;
    }
  }

  // 向后兼容：从三千大道系统中查找
  const daoDataValue = gameStateStore.thousandDao;
  const daoProgress = daoDataValue?.大道列表?.[talent];
  return daoProgress;
};

// 显示天赋详情
const showTalentDetail = (talent: string) => {
  // 首先尝试从角色的天赋列表中查找(AI生成的自定义天赋)
  const baseInfoValue = characterInfo.value;
  const customTalent = baseInfoValue?.天赋?.find((t: any) => t.name === talent);

  // 然后从LOCAL_TALENTS中查找天赋信息(前端内嵌天赋)
  const localTalent = LOCAL_TALENTS.find(t => t.name === talent);

  // 优先使用自定义天赋数据,其次使用内嵌天赋数据
  const talentInfo = customTalent ? {
    description: customTalent.description || '自定义天赋'
  } : localTalent ? {
    description: localTalent.description || ''
  } : {
    description: `天赋《${talent}》的详细描述暂未开放，请期待后续更新。`
  };

  // 构建详情内容文本（只显示描述）
  const contentText = talentInfo.description;

  uiStore.showDetailModal({
    title: talent,
    content: contentText
  });
};

// 显示状态效果详情
const showStatusDetail = (effect: StatusEffect) => {
  if (!effect || !effect.状态名称) {
    console.warn('[RightSidebar] 状态效果数据异常，无法显示详情', effect);
    return;
  }
  uiStore.showDetailModal({
    title: effect.状态名称,
    component: StatusDetailCard,
    props: { effect }
  });
};

const formatRealmDisplay = (realm?: unknown): string => {
  return formatRealmWithStage(realm);
};

// 获取声望显示文本
const getReputationDisplay = (): string => {
  const reputation = playerStatus.value?.声望;
  if (reputation === undefined || reputation === null) {
    return '籍籍无名';
  }

  const repValue = Number(reputation);

  // 负数声望（恶名）
  if (repValue < 0) {
    if (repValue <= -5000) return `恶名昭彰 (${repValue})`;
    if (repValue <= -1000) return `臭名远扬 (${repValue})`;
    if (repValue <= -500) return `声名狼藉 (${repValue})`;
    if (repValue <= -100) return `恶名在外 (${repValue})`;
    return `小有恶名 (${repValue})`;
  }

  // 正数声望
  if (repValue >= 10000) return `传说人物 (${repValue})`;
  if (repValue >= 5000) return `名满天下 (${repValue})`;
  if (repValue >= 3000) return `威震四方 (${repValue})`;
  if (repValue >= 1000) return `名动一方 (${repValue})`;
  if (repValue >= 500) return `声名远播 (${repValue})`;
  if (repValue >= 100) return `小有名气 (${repValue})`;

  return '籍籍无名';
};

// 获取声望CSS类名
const getReputationClass = (): string => {
  const reputation = playerStatus.value?.声望;
  if (reputation === undefined || reputation === null) {
    return 'reputation-neutral';
  }

  const repValue = Number(reputation);

  if (repValue < 0) {
    if (repValue <= -5000) return 'reputation-evil-legendary';
    if (repValue <= -1000) return 'reputation-evil-high';
    if (repValue <= -500) return 'reputation-evil-medium';
    if (repValue <= -100) return 'reputation-evil-low';
    return 'reputation-evil-minor';
  }

  if (repValue >= 10000) return 'reputation-legendary';
  if (repValue >= 5000) return 'reputation-famous';
  if (repValue >= 3000) return 'reputation-renowned';
  if (repValue >= 1000) return 'reputation-notable';
  if (repValue >= 500) return 'reputation-known';
  if (repValue >= 100) return 'reputation-minor';

  return 'reputation-neutral';
};
</script>

<style scoped>
.right-sidebar {
  width: 100%;
  height: 100%;
  padding: 10px 6px;
  box-sizing: border-box;
  font-family: var(--font-family-sans-serif);
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-radius: 0;
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

.right-sidebar::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 90% 0%, rgba(var(--color-primary-rgb), 0.08), transparent),
    radial-gradient(ellipse 60% 40% at 5% 5%, rgba(var(--color-accent-rgb), 0.06), transparent);
  pointer-events: none;
  z-index: 0;
}

.sidebar-header,
.sidebar-content,
.no-character {
  position: relative;
  z-index: 1;
}

.sidebar-header {
  margin: 0 0 10px 0;
  padding: 10px 8px;
  border-bottom: 1px solid rgba(var(--color-border-rgb), 0.3);
  background: transparent;
}

.sidebar-title {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
  text-align: center;
}

.title-icon {
  color: var(--color-primary);
  flex-shrink: 0;
}
.title-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 9999px;
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.2px;
}

/* 移除深色主题硬编码，使用CSS变量自动适配 */

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  padding-right: 2px;
  min-width: 0;
}

.sidebar-content::-webkit-scrollbar {
  width: 4px;
}

.sidebar-content::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-content::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 2px;
}

[data-theme="dark"] .sidebar-content::-webkit-scrollbar-thumb {
  background: transparent;
}

/* 角色基本信息样式 */
.character-info-section {
  margin-bottom: 16px;
  padding: 12px;
  background: linear-gradient(160deg, rgba(var(--color-surface-rgb), 0.86), rgba(var(--color-surface-rgb), 0.72));
  border: 1px solid rgba(var(--color-border-rgb), 0.6);
  border-radius: 4px;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08);
}

.character-basic {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.character-basic .detail-item {
  background: var(--color-surface-hover);
  border-radius: 6px;
  padding: 8px;
  font-size: 0.75rem;
}

.character-basic .detail-label {
  color: var(--color-text-secondary);
  font-weight: 500;
}

.character-basic .detail-value {
  color: var(--color-text);
  font-weight: 600;
}

/* 角色状态区域样式 */
.character-state-section {
  margin-bottom: 16px;
  padding: 12px;
  background: linear-gradient(160deg, rgba(var(--color-surface-rgb), 0.86), rgba(var(--color-surface-rgb), 0.72));
  border: 1px solid rgba(var(--color-border-rgb), 0.6);
  border-radius: 4px;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08);
}

.character-states {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.state-item {
  background: var(--color-surface-hover);
  border-radius: 6px;
  padding: 8px;
}

.state-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  font-weight: 500;
  margin-bottom: 4px;
  display: block;
}

.state-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.state-text {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-align: center;
}

.progress-fill.cultivation {
  background: linear-gradient(90deg, #8a6fa8, #a189bd);
}

/* 境界进度条 - 冲刺状态（90-99%）黄色 */
.progress-fill.cultivation.realm-sprint {
  background: linear-gradient(90deg, #c69431, #d5aa4a);
  box-shadow: 0 0 8px rgba(198, 148, 49, 0.4);
}

/* 境界进度条 - 突破状态（100%）红色 */
.progress-fill.cultivation.realm-breakthrough {
  background: linear-gradient(90deg, #c34b3c, #cd6f5f);
  box-shadow: 0 0 12px rgba(195, 75, 60, 0.5);
  animation: breakthrough-pulse 1.5s ease-in-out infinite;
}

@keyframes breakthrough-pulse {
  0%, 100% {
    box-shadow: 0 0 8px rgba(195, 75, 60, 0.4);
  }
  50% {
    box-shadow: 0 0 16px rgba(195, 75, 60, 0.7);
  }
}

/* 进度文本颜色变化 */
.progress-text.realm-sprint {
  color: #c69431;
  font-weight: 600;
}

.progress-text.realm-breakthrough {
  color: #c34b3c;
  font-weight: 700;
}

/* 突破和冲刺提示 */
.breakthrough-hint {
  font-size: 0.6rem;
  color: #c34b3c;
  font-weight: 700;
  margin-left: 4px;
  animation: hint-blink 1s ease-in-out infinite;
}

.sprint-hint {
  font-size: 0.6rem;
  color: #c69431;
  font-weight: 600;
  margin-left: 4px;
}

@keyframes hint-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 收缩区域通用样式 */
.collapsible-section {
  margin-bottom: 10px;
  padding: 0;
  background: rgba(var(--color-surface-rgb), 0.5);
  border: 1px solid rgba(var(--color-border-rgb), 0.4);
  border-radius: 10px;
  backdrop-filter: blur(4px);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.2s ease;
  border-radius: 10px 10px 0 0;
}

.section-header:hover {
  background: rgba(var(--color-surface-rgb), 0.4);
}

.collapse-toggle {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.collapse-toggle:hover {
  color: var(--color-text);
  background: var(--color-surface-hover);
}

.collapse-toggle svg {
  transform: rotate(0deg);
  transition: transform 0.2s ease;
}

.collapse-toggle.collapsed svg {
  transform: rotate(-90deg);
}

.status-details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}

.current-status {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}

.current-status .status-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 0;
}

.detail-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 8px;
  background: var(--color-surface-hover);
  border-radius: 4px;
  font-size: 0.75rem;
}

.detail-label {
  color: var(--color-text-secondary);
  font-weight: 500;
}

.detail-value {
  color: var(--color-text);
  font-weight: 600;
}

/* 六维灵根区域样式 */
.attributes-section {
  margin-bottom: 16px;
  padding: 12px;
  background: linear-gradient(160deg, rgba(var(--color-surface-rgb), 0.86), rgba(var(--color-surface-rgb), 0.72));
  border: 1px solid rgba(var(--color-border-rgb), 0.6);
  border-radius: 4px;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08);
}

.attributes-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.attribute-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  transition: all 0.2s ease;
}

.attribute-item:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-border-hover);
}

.attr-info {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.attr-name {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.attr-value {
  font-size: 0.85rem;
  color: var(--color-text);
  font-weight: 700;
}

.attr-quality {
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  border: 1px solid;
}

/* 属性品质颜色 */
.quality-purple .attr-quality {
  background: #8a6fa8;
  color: white;
  border-color: #8a6fa8;
}

.quality-orange .attr-quality {
  background: #c69431;
  color: white;
  border-color: #c69431;
}

.quality-blue .attr-quality {
  background: #4c87ad;
  color: white;
  border-color: #4c87ad;
}

.quality-green .attr-quality {
  background: #4f9b7e;
  color: white;
  border-color: #4f9b7e;
}

.quality-gray .attr-quality {
  background: #78736a;
  color: white;
  border-color: #78736a;
}

/* 灵根和声望信息 */
.spiritual-info {
  border-top: 1px solid var(--color-border);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-row {
  display: flex;
}

.info-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: var(--color-surface);
  border-radius: 4px;
  font-size: 0.75rem;
}

.info-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.info-icon {
  flex-shrink: 0;
}

.info-icon.spiritual {
  color: var(--color-accent);
}

.info-icon.reputation {
  color: var(--color-warning);
}

.info-value {
  color: var(--color-text);
  font-weight: 600;
}

/* 图标颜色 */
.section-icon.attributes {
  color: var(--color-accent);
}

/* 通用区块样式 */
.ai-chat-section,
.info-section,
.cultivation-section,
.vitals-section,
.attributes-section,
.location-section,
.wealth-section {
  margin-bottom: 10px;
  padding: 10px;
  background: rgba(var(--color-surface-rgb), 0.5);
  border: 1px solid rgba(var(--color-border-rgb), 0.4);
  border-radius: 10px;
  backdrop-filter: blur(4px);
}

/* 天赋神通特定样式 */
.talents-list {
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 空状态样式 */
.empty-talents,
.empty-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  text-align: center;
  gap: 0.5rem;
}

.empty-text {
  color: var(--color-text-secondary);
  font-size: 0.95rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
}


/* 新的标签式状态效果样式 */
.status-tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px;
}

.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  border-radius: 16px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
}

.status-tag.buff {
  background: linear-gradient(135deg, rgba(var(--color-success-rgb), 0.2), rgba(var(--color-success-rgb), 0.1));
  border-color: rgba(var(--color-success-rgb), 0.4);
  color: var(--color-success);
}

.status-tag.debuff {
  background: linear-gradient(135deg, rgba(var(--color-error-rgb), 0.2), rgba(var(--color-error-rgb), 0.1));
  border-color: rgba(var(--color-error-rgb), 0.4);
  color: var(--color-danger);
}

.status-tag:hover {
  transform: translateY(-1px);
}

.status-tag.buff:hover {
  background: linear-gradient(135deg, rgba(var(--color-success-rgb), 0.25), rgba(var(--color-success-rgb), 0.15));
  border-color: rgba(var(--color-success-rgb), 0.5);
}

.status-tag.debuff:hover {
  background: linear-gradient(135deg, rgba(var(--color-error-rgb), 0.25), rgba(var(--color-error-rgb), 0.15));
  border-color: rgba(var(--color-error-rgb), 0.5);
}

.tag-icon {
  font-size: 0.8rem;
  flex-shrink: 0;
}

.tag-name {
  font-weight: 600;
  flex-shrink: 0;
  min-width: 0;
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tag-intensity {
  font-size: 0.65rem;
  background: rgba(var(--color-warning-rgb), 0.8);
  /* 藤黄底上用墨字：原来跟正文同色只有 1.8:1 */
  color: #1a1d21;
  padding: 1px 4px;
  border-radius: 8px;
  font-weight: 600;
  flex-shrink: 0;
}

.tag-time {
  font-size: 0.65rem;
  opacity: 0.8;
  font-weight: 400;
  flex-shrink: 0;
}
/* 标题样式 - 图标和文字在一行 */
.section-title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-icon {
  color: var(--color-primary);
  opacity: 0.8;
  flex-shrink: 0;
}

.section-icon.gold {
  color: var(--color-warning);
}

.vital-icon {
  flex-shrink: 0;
}

.vital-icon.blood { color: var(--vital-health); }
.vital-icon.mana { color: var(--vital-lingqi); }
.vital-icon.spirit { color: var(--vital-spirit); }
.vital-icon.lifespan { color: var(--vital-lifespan); }
.vital-icon.reputation { color: var(--color-warning); }

/* 声望显示样式 */
.reputation-display {
  margin-top: 8px;
  border-top: 1px solid rgba(var(--color-border-rgb), 0.3);
  padding-top: 8px;
}

.reputation-item {
  background: rgba(var(--color-surface-rgb), 0.6);
  border-radius: 8px;
  padding: 8px;
  border: 1px solid rgba(var(--color-border-rgb), 0.3);
  transition: all 0.2s ease;
}

.reputation-item:hover {
  background: rgba(var(--color-surface-rgb), 0.8);
}

.reputation-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.reputation-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}

.reputation-value {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.3s ease;
}

/* 声望等级配色 */
.reputation-neutral {
  color: var(--color-text-secondary);
  background: rgba(128, 128, 128, 0.1);
  border: 1px solid rgba(128, 128, 128, 0.3);
}

/* 正面声望 */
.reputation-minor {
  color: #4f9b7e;
  background: rgba(79, 155, 126, 0.1);
  border: 1px solid rgba(79, 155, 126, 0.3);
}

.reputation-known {
  color: #4c87ad;
  background: rgba(76, 135, 173, 0.1);
  border: 1px solid rgba(76, 135, 173, 0.3);
}

.reputation-notable {
  color: #8a6fa8;
  background: rgba(138, 111, 168, 0.1);
  border: 1px solid rgba(138, 111, 168, 0.3);
}

.reputation-renowned {
  color: #c69431;
  background: rgba(198, 148, 49, 0.1);
  border: 1px solid rgba(198, 148, 49, 0.3);
}

.reputation-famous {
  color: #f97316;
  background: rgba(249, 115, 22, 0.1);
  border: 1px solid rgba(249, 115, 22, 0.3);
}

.reputation-legendary {
  color: #a83a2c;
  background: linear-gradient(135deg, rgba(168, 58, 44, 0.2), rgba(195, 75, 60, 0.1));
  border: 1px solid rgba(168, 58, 44, 0.4);
  box-shadow: 0 0 8px rgba(168, 58, 44, 0.3);
}

/* 负面声望（恶名） */
.reputation-evil-minor {
  color: #78736a;
  background: rgba(107, 114, 128, 0.1);
  border: 1px solid rgba(107, 114, 128, 0.3);
}

.reputation-evil-low {
  color: #c34b3c;
  background: rgba(195, 75, 60, 0.1);
  border: 1px solid rgba(195, 75, 60, 0.3);
}

.reputation-evil-medium {
  color: #a83a2c;
  background: rgba(168, 58, 44, 0.1);
  border: 1px solid rgba(168, 58, 44, 0.3);
}

.reputation-evil-high {
  color: #7a2b22;
  background: rgba(153, 27, 27, 0.1);
  border: 1px solid rgba(153, 27, 27, 0.3);
}

.reputation-evil-legendary {
  color: #6b2a22;
  background: linear-gradient(135deg, rgba(127, 29, 29, 0.2), rgba(153, 27, 27, 0.1));
  border: 1px solid rgba(127, 29, 29, 0.4);
  box-shadow: 0 0 8px rgba(127, 29, 29, 0.4);
}

.reputation-number {
  font-size: 0.7rem;
  color: var(--color-text-secondary);
  opacity: 0.8;
}

/* 点击提示样式 */
.clickable {
  cursor: pointer;
  transition: all 0.2s ease;
}
.clickable:hover {
  transform: translateY(-1px);
}

/* 天赋卡片样式 */
.talent-card {
  background: rgba(var(--color-accent-rgb), 0.08);
  border: 1px solid rgba(var(--color-accent-rgb), 0.2);
  border-left: 3px solid var(--color-accent);
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s ease;
  position: relative;
}

.talent-card:hover {
  background: rgba(var(--color-accent-rgb), 0.12);
  border-color: rgba(var(--color-accent-rgb), 0.3);
  transform: translateX(3px);
}

.talent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  z-index: 1;
}

.talent-name {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-accent);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.talent-level {
  font-size: 0.75rem;
  color: var(--color-warning);
  font-weight: 600;
  background: linear-gradient(135deg, rgba(var(--color-warning-rgb), 0.2), rgba(var(--color-warning-rgb), 0.1));
  padding: 4px 10px;
  border-radius: 12px;
  border: 1px solid rgba(var(--color-warning-rgb), 0.3);
  backdrop-filter: blur(4px);
}

.talent-progress {
  margin-top: 10px;
  position: relative;
  z-index: 1;
}

.progress-fill.talent {
  background: linear-gradient(90deg, var(--color-accent), var(--color-accent-hover), rgba(var(--color-accent-rgb), 0.9));
  box-shadow: 0 2px 8px rgba(var(--color-accent-rgb), 0.3);
}

/* 生命体征样式 */
.vitals-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vital-item {
  background: rgba(var(--color-surface-rgb), 0.6);
  border-radius: 8px;
  padding: 10px;
  border: 1px solid rgba(var(--color-border-rgb), 0.3);
  transition: all 0.2s ease;
}

.vital-item:hover {
  background: rgba(var(--color-surface-rgb), 0.8);
}

.vital-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.vital-name {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}

.vital-text {
  font-size: 0.75rem;
  color: var(--color-text);
  font-weight: 600;
}

.progress-bar {
  height: 6px;
  background: var(--color-surface-light);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}


.progress-fill.health { background: var(--vital-health); }
.progress-fill.mana { background: var(--vital-lingqi); }
.progress-fill.spirit { background: var(--vital-spirit); }
/* 寿元进度条统一紫色 */
.progress-fill.lifespan { background: var(--vital-lifespan); }

/* 修为状态样式 */
.realm-display {
  background: rgba(var(--color-surface-rgb), 0.6);
  border: 1px solid rgba(var(--color-border-rgb), 0.3);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
}

.realm-info {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
  flex-direction: column;
  gap: 4px;
}

.realm-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-accent);
}

.realm-breakthrough {
  font-size: 0.7rem;
  color: var(--color-text-secondary);
  line-height: 1.4;
  opacity: 0.8;
}

.realm-level {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

/* 凡人境界特殊样式 */
.realm-mortal {
  padding: 8px;
  background: rgba(var(--color-primary-rgb), 0.05);
  border-radius: 4px;
  text-align: center;
  border: 1px dashed rgba(var(--color-primary-rgb), 0.3);
}

.mortal-text {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
  font-style: italic;
  opacity: 0.8;
}

.realm-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-text {
  font-size: 0.65rem;
  color: var(--color-text-muted);
  text-align: center;
}

/* 状态效果样式 */
.status-effects {
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.status-effect {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.status-effect.buff {
  background: linear-gradient(135deg, #4f9b7e, #3f8268);
  color: white;
  box-shadow: 0 2px 4px rgba(79, 155, 126, 0.2);
}

.status-effect.debuff {
  background: linear-gradient(135deg, #c34b3c, #a83a2c);
  color: white;
  box-shadow: 0 2px 4px rgba(195, 75, 60, 0.2);
}

.status-effect:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.effect-name {
  font-size: 0.65rem;
}

.effect-time {
  font-size: 0.6rem;
  opacity: 0.8;
}

/* 无角色数据样式 */
.no-character {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 10px;
}

.no-char-text {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  font-style: italic;
}

/* 响应式设计 */
@media (max-width: 640px) {
  .right-sidebar {
    padding: 12px;
  }

  .sidebar-title {
    font-size: 0.9rem;
  }

  .section-title {
    font-size: 0.8rem;
  }

  .vitals-list {
    gap: 8px;
  }

  .vital-item {
    padding: 6px;
  }

  .vital-name {
    font-size: 0.7rem;
  }

  .vital-text {
    font-size: 0.65rem;
  }

  .talent-card {
    padding: 10px;
  }

  .talent-name {
    font-size: 0.8rem;
  }

  .status-effect-card {
    padding: 8px 10px;
  }

  .effect-name {
    font-size: 0.75rem;
  }

  .status-tags-container {
    gap: 6px;
    padding: 8px;
  }

  .status-tag {
    font-size: 0.7rem;
    padding: 4px 8px;
    gap: 4px;
  }

  .tag-intensity {
    font-size: 0.6rem;
    padding: 1px 3px;
  }

  .tag-time {
    font-size: 0.6rem;
  }

  .detail-item {
    padding: 5px 6px;
    font-size: 0.7rem;
  }

  .attributes-grid {
    gap: 6px;
  }

  .attribute-item {
    padding: 6px;
  }

  .attr-name {
    font-size: 0.7rem;
  }

  .attr-value {
    font-size: 0.8rem;
  }

  .attr-quality {
    font-size: 0.6rem;
    padding: 1px 4px;
  }

  .info-item {
    padding: 5px 6px;
    font-size: 0.7rem;
  }

  .realm-name {
    font-size: 0.8rem;
  }

  .progress-bar {
    height: 5px;
  }
}

@media (max-width: 480px) {
  .right-sidebar {
    padding: 8px;
  }

  .sidebar-header {
    margin-bottom: 12px;
    padding-bottom: 8px;
  }

  .vitals-section,
  .cultivation-section,
  .collapsible-section {
    margin-bottom: 12px;
    padding: 10px;
  }

  .attributes-section {
    margin-bottom: 12px;
    padding: 10px;
  }

  .attributes-grid {
    gap: 4px;
  }

  .attribute-item {
    padding: 5px;
  }

  .attr-name {
    font-size: 0.65rem;
  }

  .attr-value {
    font-size: 0.75rem;
  }

  .attr-quality {
    font-size: 0.55rem;
    padding: 1px 3px;
  }

  .status-details {
    grid-template-columns: 1fr;
  }

  .talents-list {
    padding: 0 12px 12px;
  }

  .status-effects {
    padding: 0 12px 12px;
  }

  .status-tags-container {
    gap: 4px;
    padding: 6px;
  }

  .status-tag {
    font-size: 0.65rem;
    padding: 3px 6px;
    gap: 3px;
  }

  .tag-intensity {
    font-size: 0.55rem;
    padding: 1px 2px;
  }

  .tag-time {
    font-size: 0.55rem;
  }
}

/* 平板设备优化 */
@media (min-width: 769px) and (max-width: 1024px) {
  .right-sidebar {
    padding: 14px;
  }

  .vital-item {
    padding: 7px;
  }

  .talent-card {
    padding: 11px;
  }
}

/* 大屏幕优化 */
@media (min-width: 1440px) {
  .right-sidebar {
    padding: 20px;
  }

  .sidebar-title {
    font-size: 1.1rem;
  }

  .section-title {
    font-size: 0.9rem;
  }

  .vital-name {
    font-size: 0.8rem;
  }

  .talent-name {
    font-size: 0.9rem;
  }

  .effect-name {
    font-size: 0.85rem;
  }

  .status-tags-container {
    gap: 10px;
    padding: 16px;
  }

  .status-tag {
    font-size: 0.8rem;
    padding: 8px 12px;
  }
}

/* 深色主题：使用CSS变量自动适配，无需额外覆盖 */

.quest-section .quest-body { padding: 6px 10px 10px; display: flex; flex-direction: column; gap: 6px; }
.quest-chapter { font-size: 12px; font-weight: 600; opacity: 0.9; display: flex; align-items: center; }
.quest-event { font-size: 12px; line-height: 1.6; opacity: 0.95; font-weight: 500; padding-left: 2px; }
.quest-mark-main { color: var(--color-accent, #d4af37); font-weight: 700; margin-right: 6px; }
.quest-more { font-size: 11px; opacity: 0.4; padding-left: 18px; margin-top: 1px; }
.quest-tag { font-size: 10px; line-height: 1; padding: 2px 5px; border-radius: 3px; margin-right: 6px; letter-spacing: 1px; font-weight: 600; }
.quest-tag-main { color: #1a1a1a; background: var(--color-accent, #d4af37); }
.quest-tag-side { color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.12); }
.quest-improv-label { font-size: 11px; opacity: 0.55; display: flex; align-items: center; margin-bottom: 2px; }
.quest-mark-side { color: rgba(255,255,255,0.35); margin-right: 6px; }
.quest-next { font-size: 12px; color: var(--color-accent, #d4af37); }
.quest-improv { border-top: 1px dashed rgba(255,255,255,0.12); padding-top: 6px; }
.quest-goal { font-size: 12px; line-height: 1.5; opacity: 0.65; }
.quest-cleared { font-size: 12px; color: #7dc87d; }
.quest-next-btn { margin-top: 4px; width: 100%; padding: 5px 8px; font-size: 12px; border: 1px solid var(--color-accent, #d4af37); background: transparent; color: var(--color-accent, #d4af37); border-radius: 4px; cursor: pointer; }
.quest-next-btn:hover:not(:disabled) { background: rgba(212,175,55,0.15); }
.quest-next-btn:disabled { opacity: 0.5; cursor: default; }
.quest-error { font-size: 11px; color: #e07a7a; }
.actor-pressure { font-size: 12px; line-height: 1.55; padding: 7px 8px; border-left: 2px solid var(--color-accent, #d4af37); background: rgba(212,175,55,0.07); }
.actor-signal { display: flex; font-size: 12px; line-height: 1.55; }
.actor-card { padding: 8px; border: 1px solid rgba(212,175,55,0.25); border-radius: 6px; background: rgba(255,255,255,0.025); }
.actor-card-title { color: var(--color-accent, #d4af37); font-size: 12px; font-weight: 700; margin-bottom: 5px; }
.actor-card-line { font-size: 11px; line-height: 1.5; opacity: 0.9; margin-top: 3px; }
.actor-card-line > span { display: inline-block; min-width: 48px; opacity: 0.55; }
.actor-card-risk { margin-top: 4px; font-size: 11px; line-height: 1.45; color: #d99a70; }
.actor-window-tight { color: #e07a7a; font-weight: 700; opacity: 1; }
.actor-ignore { font-size: 10px; line-height: 1.45; opacity: 0.5; text-align: center; }
.actor-receipt { font-size: 11px; line-height: 1.5; color: #8fc98f; }
.actor-permission { font-size: 11px; line-height: 1.5; padding: 5px 7px; border-radius: 4px; color: #e3c970; background: rgba(212,175,55,0.09); }

</style>
