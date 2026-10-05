<template>
  <div class="main-game-panel">
    <WorldSimulationPlaytestPanel />
    <aside v-if="currentTravelCard" class="travel-card" aria-label="路途卡">
      <strong>{{ currentTravelCard.from }} → {{ currentTravelCard.to }} · {{ currentTravelCard.duration }}</strong>
      <p>{{ currentTravelCard.summary || currentTravelCard.label }}</p>
      <p v-if="currentTravelCard.companions?.length">同行：{{ currentTravelCard.companions.join('、') }}</p>
    </aside>
    <XingyuehuQuestPlaytestHud />
    <!-- 短期记忆区域 -->
    <div class="memory-section" v-if="showMemorySection">
      <div class="memory-header" @click="toggleMemory">
        <span class="memory-title">{{ t('短期记忆') }}</span>
        <ChevronDown v-if="memoryExpanded" :size="16" class="memory-icon" />
        <ChevronRight v-else :size="16" class="memory-icon" />
      </div>

      <!-- 下拉悬浮的记忆内容 -->
      <Transition name="memory-dropdown">
        <div v-if="memoryExpanded" class="memory-dropdown">
          <div class="memory-content">
            <div v-for="(memory, index) in recentMemories" :key="index" class="memory-item">
              {{ memory }}
            </div>
            <div v-if="recentMemories.length === 0" class="no-memory">
              {{ t('脑海中一片清净，尚未留下修行痕迹...') }}
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- 文本显示区域 - 当前AI回复 -->
    <div class="content-area" ref="contentAreaRef" @scroll="handleContentScroll">
      <!-- 左侧：当前叙述 -->
      <div class="current-narrative">
        <!-- AI生成状态指示器（生成时显示在顶部） -->
        <div v-if="isAIProcessing" class="ai-processing-indicator">
          <div class="streaming-meta">
            <span class="narrative-time">{{ formatCurrentTime() }}</span>
            <div class="streaming-indicator">
              <span class="streaming-dot"></span>
              <span class="streaming-text">{{ streamingContent ? `${streamingCharCount} ${t('字')}` : t('天道感应中...') }}</span>
            </div>
            <!-- 重置按钮 - 右侧 -->
            <button
              @click="forceResetAIProcessingState"
              class="reset-state-btn"
              :title="t('如果长时间无响应，点击此处重置状态')"
            >
              <RotateCcw :size="16" />
            </button>
          </div>
        </div>

        <!-- 思维链显示区域（可折叠）- 生成中和完成后都显示 -->
        <div v-if="thinkingContent || lastThinkingContent" class="thinking-section">
          <div class="thinking-header" @click="uiStore.toggleThinkingExpanded()">
            <BrainCircuit :size="16" class="thinking-icon" />
            <span class="thinking-title">{{ t('思维过程') }}</span>
            <span v-if="isThinkingPhase" class="thinking-badge streaming">{{ t('思考中...') }}</span>
            <span v-else-if="thinkingContent || lastThinkingContent" class="thinking-badge completed">{{ t('已完成') }}</span>
            <ChevronDown v-if="thinkingExpanded" :size="16" class="expand-icon" />
            <ChevronRight v-else :size="16" class="expand-icon" />
          </div>
          <Transition name="thinking-expand">
            <div v-if="thinkingExpanded" class="thinking-content">
              <FormattedText :text="thinkingContent || lastThinkingContent" />
            </div>
          </Transition>
        </div>

        <!-- 流式输出内容（生成时实时显示，优先级最高） -->
        <div v-if="isAIProcessing && streamingContent" class="streaming-narrative-content">
          <div v-if="uiStore.lastSentUserIntentText" class="last-user-intent">
            <div class="last-user-intent-header">
              <span class="k">你的输入</span>
              <span v-if="uiStore.lastSentUserIntentSource === 'action_option'" class="badge">来自行动推荐</span>
              <span v-else-if="uiStore.lastSentUserIntentSource === 'mixed'" class="badge">含行动推荐</span>
            </div>
            <div class="last-user-intent-text">{{ uiStore.lastSentUserIntentText }}</div>
          </div>
          <div class="streaming-text">
            <FormattedText :text="streamingContent" />
          </div>
        </div>

        <!-- 上一次的叙述内容（非生成时显示） -->
        <div
          v-else-if="currentNarrative"
          class="narrative-content"
          :class="{ 'stage-entry-narrative': currentNarrative.type === 'stage_entry' }"
        >
          <div class="narrative-meta">
            <div class="narrative-heading">
              <span class="narrative-time">{{ currentNarrative.time }}</span>
              <span v-if="currentNarrative.type === 'stage_entry'" class="stage-entry-badge">旅途新章</span>
            </div>
            <div class="meta-buttons">
              <!-- 快照回退按钮 -->
              <button
                v-if="snapshots.length > 0"
                @click="rollbackToLastSnapshot"
                class="header-action-btn snapshot-btn"
                :title="t('回退到上一条对话')"
              >
                <History :size="20" />
                <span class="snapshot-count">{{ snapshots.length }}</span>
              </button>

              <button
                @click="openEventsPanel"
                class="header-action-btn event-btn"
                :title="t('世界事件')"
              >
                <Bell :size="20" />
              </button>

              <!-- 命令日志按钮 -->
              <button
                @click="showStateChanges(currentNarrative.stateChanges)"
                class="variable-updates-toggle"
                :class="{ disabled: currentNarrativeStateChanges.length === 0 }"
                :disabled="currentNarrativeStateChanges.length === 0"
                :title="currentNarrativeStateChanges.length > 0 ? t('查看本次对话的变更日志') : t('本次对话无变更记录')"
              >
                <ScrollText :size="16" />
                <span class="update-count">{{ currentNarrativeStateChanges.length }}</span>
              </button>
            </div>
          </div>
          <div v-if="currentNarrative.userIntent" class="last-user-intent">
            <div class="last-user-intent-header">
              <span class="k">你的输入</span>
            </div>
            <div class="last-user-intent-text">{{ currentNarrative.userIntent }}</div>
          </div>
          <div class="narrative-text">
            <img v-if="currentNarrative.image" :src="resolveEndingImage(currentNarrative.image)" alt="剧情插图" style="display:block;max-width:100%;height:auto;margin:0 auto 1rem;" />
            <FormattedText :text="currentNarrative.content" />
          </div>

          <div v-if="engineButtonOptions.length" class="action-options engine-action-options">
            <button
              v-for="option in engineButtonOptions"
              :key="`${option.contractHash}:${option.source}:${'stepId' in option ? option.stepId : option.eventId}:${option.actionId}`"
              @click="selectScenarioEngineAction(option)"
              class="action-option-btn engine-action-btn"
              :disabled="isAIProcessing"
            >
              <span v-if="showScenarioActionMechanics(option)" class="engine-action-badge">{{ option.source === 'event_engine' ? t('主线') : option.source === 'exploration_engine' ? t('探索') : option.source === 'open_world_engine' ? t('地方') : option.source === 'baihu_gamble_refusal_engine' ? t('应对') : t('机会') }}</span>
              {{ option.label }}<template v-if="showScenarioActionMechanics(option)"> · 耗时 {{ 'timeCost' in option ? (option.timeCost ?? 1) : 1 }} 回合<template v-if="'remainingTurns' in option && option.remainingTurns !== undefined"> · 剩余 {{ option.remainingTurns }} 次重要行动</template></template>
              <span v-if="'costHint' in option && option.costHint" class="engine-action-cost"> · {{ option.costHint }}</span>
            </button>
            <div class="engine-action-hint">{{ qingyuOpeningDemo ? t('可以直接描述行动，也可点按建议填入') : t('点按填入，可修改后发送') }}</div>
          </div>

          <div v-if="stageDepartureOffer" class="action-options opportunity-action-options">
            <button
              class="action-option-btn opportunity-action-btn"
              :disabled="isAIProcessing || stageDeparturePending"
              @click="departToNextStage"
            >
              {{ stageDeparturePending ? t('启程中…') : stageDepartureOffer.label }}
            </button>
          </div>

          <!-- 行动选项 -->
          <div
            v-if="!scenarioGameOver && uiStore.enableActionOptions && !keyBeatCard && !branchDecision && currentNarrative.actionOptions?.length && scenarioEngineActionOptions.length"
            class="other-action-label"
          >
            {{ t('其他行动') }}
          </div>
          <div v-if="!scenarioGameOver && uiStore.enableActionOptions && !keyBeatCard && !branchDecision && currentNarrative.actionOptions?.length" class="action-options secondary-action-options">
            <button
              v-for="(option, index) in currentNarrative.actionOptions"
              :key="index"
              @click="selectActionOption(option)"
              class="action-option-btn"
            >
              {{ option }}
            </button>
          </div>
        </div>

        <div v-else class="empty-narrative">
          {{ t('静待天机变化...') }}
        </div>
      </div>
    </div>


    <!-- 输入区域 -->
    <div class="input-section">
      <section v-if="pendingJudgement" class="judgement-preflight-card">
        <div class="judgement-preflight-title">行动判定（尚未掷骰） · {{ pendingJudgement.kind }}</div>
        <div class="judgement-preflight-action">{{ pendingJudgement.actionText }}</div>
        <p>{{ pendingJudgement.whyNow }}</p>
        <div class="judgement-preflight-factors">
          <span v-for="factor in pendingJudgement.factors" :key="factor.label">{{ factor.label }} {{ factor.value >= 0 ? '+' : '' }}{{ factor.value }}</span>
          <span>难度 {{ pendingJudgement.difficulty.value }}</span>
        </div>
        <small v-if="pendingJudgement.canonPolicy === 'if_only'">此行动会改写正典，须先进入显式 IF 支线；默认线不可执行。</small>
        <small v-else>
          <template v-if="pendingJudgement.stakes.perfect">完美成功：{{ pendingJudgement.stakes.perfect }}　</template>
          <template v-if="pendingJudgement.stakes.greatSuccess">大成功：{{ pendingJudgement.stakes.greatSuccess }}　</template>
          成功：{{ pendingJudgement.stakes.success }}　部分成功：{{ pendingJudgement.stakes.partial }}　失败：{{ pendingJudgement.stakes.failure }}
          <template v-if="pendingJudgement.stakes.criticalFailure">　大失败：{{ pendingJudgement.stakes.criticalFailure }}</template>
        </small>
        <div class="judgement-preflight-actions">
          <button @click="executePendingJudgement" :disabled="isAIProcessing || pendingJudgement.canonPolicy === 'if_only'">确认并掷骰</button>
          <button v-if="showJudgementTestControls" class="test-great-success-button" @click="executePendingJudgement('great_success')" :disabled="isAIProcessing || pendingJudgement.canonPolicy === 'if_only'">大成功（测试）</button>
          <button @click="changePendingJudgement" :disabled="isAIProcessing">换一种做法</button>
          <button @click="cancelPendingJudgement" :disabled="isAIProcessing">撤回</button>
        </div>
      </section>
      <section v-else-if="latestJudgement?.status === 'resolved'" class="judgement-result-card">
        <div class="judgement-preflight-title">本地判定结果 · {{ latestJudgement.outcome }}</div>
        <div>{{ latestJudgement.actionText }}</div>
        <div class="judgement-preflight-factors">
          <span>骰点 {{ latestJudgement.roll }}</span>
          <span>总值 {{ latestJudgement.total }}</span>
          <span>难度 {{ latestJudgement.difficulty.value }}</span>
          <span>策略 {{ latestJudgement.canonPolicy }}</span>
          <span v-if="latestJudgement.testOverride">测试强制 {{ latestJudgement.testOverride }}</span>
        </div>
        <small v-if="latestJudgement.appliedEffects.length">已写入：{{ latestJudgement.appliedEffects.map(describeJudgementEffect).join('、') }}</small>
        <small v-else>本次没有确定性状态余波。</small>
      </section>
      <!-- 动作队列显示区域 -->
      <div v-if="actionQueue.pendingActions.length > 0" class="action-queue-display">
        <div class="queue-header">
          <span class="queue-title">{{ t('最近操作') }}</span>
          <button @click="clearActionQueue" class="clear-queue-btn" :title="t('清空记录')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="queue-actions">
          <div
            v-for="(action, index) in actionQueue.pendingActions"
            :key="action.id"
            class="queue-action-item"
          >
            <span class="action-text">{{ action.description }}</span>
            <div class="action-controls">
              <button
                @click="removeActionFromQueue(index)"
                class="remove-action-btn"
                :title="isUndoableAction(action) ? t('撤回并恢复') : t('删除此动作')"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      </div>

      <section v-if="keyBeatCard" class="key-beat-card" :class="{ 'is-highlighted': keyBeatHighlight }" data-testid="key-beat-card">
        <div class="key-beat-title">{{ KEY_BEAT_CARD_TITLE }}</div>
        <button
          v-for="option in keyBeatCard.options"
          :key="`${option.selection.eventId}:${option.selection.actionId}`"
          class="key-beat-option"
          data-testid="key-beat-option"
          :disabled="isAIProcessing"
          @click="confirmKeyBeatCard(option)"
        >
          <span class="key-beat-label">{{ option.label }}</span>
          <span v-if="option.stepTag || option.judgementTag" class="key-beat-tag">{{ [option.stepTag, option.judgementTag].filter(Boolean).join(' · ') }}</span>
        </button>
        <p class="key-beat-hint">{{ KEY_BEAT_CARD_HINT }}</p>
      </section>
      <section v-if="branchDecision" class="key-beat-card" data-testid="branch-decision">
        <div class="key-beat-title">{{ BRANCH_DECISION_TITLE }}</div>
        <button
          v-for="(option, index) in branchDecision.options"
          :key="`${option.eventId}:${option.actionId}`"
          class="key-beat-option"
          data-testid="branch-decision-option"
          :disabled="isAIProcessing"
          @click="confirmBranchDecision(option)"
        >
          <span class="key-beat-label">{{ branchDecision.labels[index] }}</span>
        </button>
        <p class="key-beat-hint">{{ BRANCH_DECISION_HINT }}</p>
      </section>
      <div v-if="intentHoldMessage" class="intent-hold-message" data-testid="intent-hold-message" role="status">{{ intentHoldMessage }}</div>
      <div v-if="!branchDecision" class="input-wrapper">
        <!-- 隐藏的文件选择器 -->
        <input
          type="file"
          ref="imageInputRef"
          @change="handleImageSelect"
          multiple
          accept="image/*"
          style="display: none"
        />

        <!-- 图片上传按钮 - 已禁用 -->
        <button
          v-if="false"
          @click="openImagePicker"
          class="action-selector-btn image-upload-btn"
          :disabled="!hasActiveCharacter"
          :title="t('上传图片')"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>

        <!-- 快捷行动按钮 - 已禁用 -->
        <button
          v-if="false"
          @click="showActionSelector"
          class="action-selector-btn"
          :disabled="!hasActiveCharacter"
          :title="t('快捷行动')"
        >
          <ChevronDown :size="16" />
        </button>

        <div class="input-container">
          <!-- 图片预览区域 -->
          <div v-if="selectedImages.length > 0" class="image-preview-container">
            <div
              v-for="(image, index) in selectedImages"
              :key="index"
              class="image-preview-item"
            >
              <img :src="getImagePreviewUrl(image)" :alt="image.name" />
              <button @click="removeImage(index)" class="remove-image-btn" :title="t('移除图片')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>

          <div v-if="scenarioGameOver" class="game-over-card">
            <img v-if="scenarioEndingImage && resolveEndingImage(currentNarrative?.image) !== scenarioEndingImage" :src="scenarioEndingImage" :alt="scenarioGameOver.title" class="ending-image" />
            <div class="game-over-head">
              <span class="game-over-tag">本局结束</span>
              <h3>{{ scenarioGameOver.title }}</h3>
            </div>
            <p class="game-over-hint">这条路走到了尽头。本局结局如下。</p>
            <p v-for="(fact, index) in scenarioGameOver.facts" :key="index" class="game-over-hint">{{ fact }}</p>
            <div class="game-over-acts">
              <button v-if="canRollback" @click="rollbackToLastConversation" class="go-primary">回到上一轮</button>
              <button @click="router.push('/')" class="go-ghost">返回角色选择</button>
            </div>
          </div>

          <div v-else-if="nanhuangDemoFinished" class="game-over-card">
            <div class="game-over-head"><span class="game-over-tag">本期结束</span><h3>南荒这一段已经走完</h3></div>
            <p class="game-over-hint">进度已保留，可返回入口选择下一期重新试玩。</p>
            <button class="go-primary" @click="router.push('/qingyu-opening-playtest')">返回试玩入口</button>
          </div>
          <div v-else-if="xingyuehuPlaytestFinished" class="game-over-card">
            <div class="game-over-head">
              <span class="game-over-tag">试玩完成</span>
              <h3>{{ xingyuehuLandingFinished ? '星月湖组织支持这一段已经听清' : '星月湖这一段任务线已经结束' }}</h3>
            </div>
            <p class="game-over-hint">{{
              xingyuehuLandingFinished
                ? '这是星月湖组织支持的阶段结局，不是整个星月湖故事完结。'
                : '谢艺的命运、你的介入方式和星月湖的回应都已写入这个隔离存档。'
            }}</p>
            <div class="game-over-acts">
              <button @click="router.push('/xingyuehu-quest-playtest')" class="go-primary">返回试玩入口</button>
              <button @click="router.push('/')" class="go-ghost">返回角色选择</button>
            </div>
          </div>

          <textarea
            v-model="inputText"
            @focus="isInputFocused = true"
            @blur="isInputFocused = false"
            @keydown="handleKeyDown"
            @input="handleInput"
            :placeholder="scenarioGameOver ? '本局已结束' : playtestFinished ? '本次试玩已结束' : branchDecision ? `${BRANCH_DECISION_TITLE}：请点选上方选项` : hasActiveCharacter ? t('请输入您的选择或行动...') : t('请先选择角色...')"
            :readonly="!!branchDecision"
            class="game-input"
            ref="inputRef"
            rows="1"
            wrap="soft"
            :disabled="!hasActiveCharacter || isAIProcessing || playtestFinished || !!scenarioGameOver"
          ></textarea>
        </div>

        <button
          @click="sendMessage"
          :disabled="!inputText.trim() || isAIProcessing || !hasActiveCharacter || playtestFinished || !!scenarioGameOver || (!!branchDecision && !branchDecisionReady)"
          class="send-button"
        >
          <Loader2 v-if="isAIProcessing" :size="16" class="animate-spin" />
          <Send v-else :size="16" />
        </button>
      </div>

      <!-- 行动选择弹窗 -->
      <div v-if="showActionModal" class="action-modal-overlay" @click.self="hideActionSelector">
        <div class="action-modal">
          <div class="modal-header">
            <h3>{{ t('快捷行动') }}</h3>
            <button @click="hideActionSelector" class="close-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="action-grid">
            <button
              v-for="action in flatActions"
              :key="action.name"
              @click="selectAction(action)"
              class="quick-action-btn"
              :class="action.type"
            >
              <div class="action-icon">{{ action.icon }}</div>
              <div class="action-text">{{ action.name }}</div>
            </button>
          </div>
        </div>
      </div>

      <!-- 行动配置弹窗 -->
      <div v-if="selectedAction" class="action-config-overlay" @click.self="cancelAction">
        <div class="action-config-modal">
          <div class="config-header">
            <h3>{{ selectedAction.icon }} {{ selectedAction.name }}</h3>
            <button @click="cancelAction" class="close-btn">×</button>
          </div>
          <div class="config-content">
            <p class="action-description">{{ selectedAction.description }}</p>

            <!-- 时间配置 -->
            <div v-if="selectedAction.timeRequired" class="config-section">
              <label class="config-label">{{ t('修炼时间') }}</label>
              <div class="time-selector">
                <button
                  v-for="timeOption in timeOptions"
                  :key="timeOption.value"
                  @click="selectedTime = timeOption.value"
                  class="time-btn"
                  :class="{ active: selectedTime === timeOption.value }"
                >
                  {{ timeOption.label }}
                </button>
              </div>
              <div class="time-custom">
                <label>{{ t('自定义：') }}</label>
                <input
                  v-model.number="customTime"
                  type="number"
                  min="1"
                  max="365"
                  class="time-input"
                /> {{ t('天') }}
              </div>
            </div>

            <!-- 其他配置选项 -->
            <div v-if="selectedAction.options" class="config-section">
              <label class="config-label">{{ t('选项') }}</label>
              <div class="action-options">
                <label
                  v-for="option in selectedAction.options"
                  :key="option.key"
                  class="option-item"
                >
                  <input
                    type="radio"
                    :name="'option-' + selectedAction.name"
                    :value="option.key"
                    v-model="selectedOption"
                  />
                  <span>{{ option.label }}</span>
                </label>
              </div>
            </div>
          </div>
          <div class="config-actions">
            <button @click="cancelAction" class="cancel-btn">{{ t('取消') }}</button>
            <button @click="confirmAction" class="confirm-btn">{{ t('确认') }}</button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { endingPresentation } from '@/modules/scenarioMods/endingPresentation';
import { resolveEndingImage } from '@/assets/endings';
import { cancelModuleBackground, startModuleBackground } from '@/services/modularTurnBackground';
import { scheduleBackgroundAudit, yieldBackgroundAudit } from '@/services/backgroundAudit';
import { BRANCH_DECISION_HINT, BRANCH_DECISION_TITLE, branchDecisionAllowsSend, detectBranchDecision, isDormantLockedOption, type BranchDecisionCandidate } from '@/modules/scenarioMods/branchDecision';
import { getActiveKeyBeatCard, isKeyBeatCardAction, KEY_BEAT_CARD_HINT, KEY_BEAT_CARD_TITLE, KEY_BEAT_CONFIRM_NOTICE, type KeyBeatCardOption } from '@/modules/scenarioMods/keyBeatCards';
import { ref, onMounted, onActivated, onUnmounted, nextTick, computed, watch } from 'vue';
import {
  Send, Loader2, ChevronDown, ChevronRight, ScrollText, RotateCcw, Shield, BrainCircuit, Bell, History
} from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { useI18n } from '@/i18n';
import { useCharacterStore } from '@/stores/characterStore';
import { useActionQueueStore } from '@/stores/actionQueueStore';
import { useUIStore } from '@/stores/uiStore';
import { panelBus } from '@/utils/panelBus';
import { chatBus, type ChatBusPayload } from '@/utils/chatBus';
import { EnhancedActionQueueManager } from '@/utils/enhancedActionQueue';
import { AIBidirectionalSystem, getTavernHelper } from '@/utils/AIBidirectionalSystem';
import { isTavernEnv } from '@/utils/tavern';
import { toast } from '@/utils/toast';
import { calculateAgeFromBirthdate } from '@/utils/lifespanCalculator';
import { aiService } from '@/services/aiService';
import { extractTextFromJsonResponse, extractStreamingNarrativeText } from '@/utils/textSanitizer';
import { validateProcessedAIResponse } from '@/utils/processedAIResponseValidation';
import { usesFixedScenarioInventory } from '@/modules/scenarioMods/fixedInventoryContracts';
import {
  beginQingyuTurnLongRequests,
  invalidateQingyuTurnLongRequests,
  peekActiveQingyuTurnId,
  remainingQingyuTurnLongRequests,
  releaseQingyuTurnLongRequests,
} from '@/services/qingyuTurnLongRequests';
import { isAiRequestTimeout } from '@/services/aiRequestDeadline';
import FormattedText from '@/components/common/FormattedText.vue';
import WorldSimulationPlaytestPanel from '@/components/dashboard/WorldSimulationPlaytestPanel.vue';
import XingyuehuQuestPlaytestHud from '@/components/dashboard/XingyuehuQuestPlaytestHud.vue';
import { getTravelCard } from '@/modules/scenarioMods/travel/travelLedger';
import { useGameStateStore } from '@/stores/gameStateStore';
import { getSnapshots } from '@/utils/snapshotManager';
import {
  cancelPendingJudgement as cancelStoredJudgement,
  getJudgementState,
  persistPendingJudgement,
  resolvePendingJudgement,
  describeJudgementEffect,
  type JudgementProposal,
  type JudgementResolution,
  type JudgementOutcome,
} from '@/utils/judgementEngine';
import { buildLocalJudgementPreflight, composeJudgementAction, prepareEventActionJudgement, shouldSkipJudgementPreflight } from '@/utils/judgementPreflight';
import { getNarrativeTurn } from '@/utils/actionGate';
import {
  advanceScenarioRuntime,
  getCurrentStoryEventActions,
  getCurrentStoryExplorationActions,
  getStageEntryPresentation,
  getStageDepartureOffer,
  getTrackedStoryOpportunityActions,
  resolveStoryEventActionFromPlayerText,
  type ScenarioEventActionSelection,
  type ScenarioOpportunityActionSelection,
} from '@/modules/scenarioMods/runtime';
import {
  getWuyuanOpenWorldSelections,
  resolveWuyuanOpenWorldSelectionFromText,
  type WuyuanOpenWorldSelection,
} from '@/modules/scenarioMods/wuyuanOpenWorldSlice';
import {
  BAIHU_GAMBLE_REFUSAL_SOURCE,
  getBaihuGambleRefusalSelections,
  resolveBaihuGambleRefusalFromText,
  type BaihuGambleRefusalSelection,
} from '@/modules/scenarioMods/baihuGambleRefusal';
import {
  getCurrentWorldSituation,
  getWorldSimulationPresentationNotices,
  settleWorldSimulationJudgement,
} from '@/modules/scenarioMods/worldSimulation';
import { WORLD_SIMULATION_PLAYTEST_KIND } from '@/modules/scenarioMods/worldSimulationPlaytest';
import { isQingyuOpeningPlaytestSave, isNanhuangDemoFinished } from '@/modules/scenarioMods/qingyuOpeningPlaytest';
import {
  abortInFlightNaturalIntent,
  intentSaveFingerprint,
  NATURAL_INTENT_CLARIFY_DEFAULT,
  resolveNaturalIntent,
  verifyFreshSelection,
} from '@/modules/scenarioMods/naturalIntentRouter';
import { isXingyuehuQuestPlaytestFinished } from '@/modules/scenarioMods/xingyuehuQuestPlaytest';
import { isXingyuehuLandingPlaytestFinished } from '@/modules/scenarioMods/xingyuehuLandingPlaytest';
import { settleFastNarrativeDemoAdjudication } from '@/modules/scenarioMods/fastNarrativeDemoAdjudication';
import {
  isFastNarrativeHoldResponse,
} from '@/modules/scenarioMods/fastNarrativeDemo';
import type {  CharacterProfile } from '@/types/game';
import type { GM_Response } from '@/types/AIGameMaster'; // AIGameMaster.d.ts 仍然需要保留

// 定义状态变更日志类型
interface StateChangeLog {
  changes: Array<{
    key: string;
    action: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
}


// --- 计算属性：从当前叙述中安全地获取状态变更列表 ---
const currentNarrativeStateChanges = computed(() => {
  return currentNarrative.value?.stateChanges?.changes || [];
});


// 🔥 使用 uiStore 持久化输入框内容
const inputText = computed({
  get: () => uiStore.userInputText,
  set: (value: string) => { uiStore.userInputText = value; }
});
const isInputFocused = ref(false);
const pendingJudgement = ref<JudgementProposal | null>(null);
const latestJudgement = ref<JudgementResolution | null>(null);
const showJudgementTestControls = JUDGEMENT_TEST_CONTROLS;

const refreshPendingJudgement = () => {
  const save = gameStateStore.toSaveData();
  const state = save ? getJudgementState(save) : null;
  pendingJudgement.value = state?.pending || null;
  latestJudgement.value = state?.recent.at(-1) || null;
};

const persistJudgementSave = async (save: any) => {
  gameStateStore.loadFromSaveData(save);
  await characterStore.saveCurrentGame();
  refreshPendingJudgement();
};
// 🔥 使用全局状态替代组件状态
const isAIProcessing = computed(() => uiStore.isAIProcessing);
const streamingContent = computed(() => uiStore.streamingContent);
const currentGenerationId = computed(() => uiStore.currentGenerationId);
const streamingCharCount = computed(() => uiStore.streamingContent.length);

// 🔥 思维链状态
const thinkingContent = computed(() => uiStore.thinkingContent);
const isThinkingPhase = computed(() => uiStore.isThinkingPhase);
const thinkingExpanded = computed(() => uiStore.thinkingExpanded);

// 🔥 保存上一次的思维链内容（传输完成后仍可查看）
const lastThinkingContent = ref('');

// 🔥 流式内容解析状态（用于解析 <thinking> 标签）
const streamParseState = ref({
  inThinking: false,
  buffer: '',
  rawResponse: ''
});

// 🔥 处理流式 chunk，解析思维链标签
const handleStreamChunk = (chunk: string) => {
  if (!chunk) return;

  const state = streamParseState.value;
  state.rawResponse += chunk;
  state.buffer += chunk;

  // 处理缓冲区中的内容
  while (state.buffer.length > 0) {
    if (!state.inThinking) {
      // 查找 <thinking> 开始标签
      const thinkingStart = state.buffer.indexOf('<thinking>');
      if (thinkingStart === -1) {
        // 没有找到标签，检查是否可能是不完整的标签
        if (state.buffer.length > 8 && !state.buffer.includes('<')) {
          // 安全地输出所有内容作为正文
          uiStore.appendStreamingContent(state.buffer);
          state.buffer = '';
        } else if (state.buffer.length > 35) {
          // 缓冲区太长，输出前面的内容
          const safeLen = state.buffer.lastIndexOf('<');
          if (safeLen > 0) {
            uiStore.appendStreamingContent(state.buffer.substring(0, safeLen));
            state.buffer = state.buffer.substring(safeLen);
          } else {
            uiStore.appendStreamingContent(state.buffer);
            state.buffer = '';
          }
        }
        break;
      } else {
        // 找到 <thinking> 标签
        if (thinkingStart > 0) {
          // 标签前有正文内容
          uiStore.appendStreamingContent(state.buffer.substring(0, thinkingStart));
        }
        state.buffer = state.buffer.substring(thinkingStart + 10); // 跳过 <thinking>
        state.inThinking = true;
        uiStore.isThinkingPhase = true;
      }
    } else {
      // 在思维链中，查找 </thinking> 结束标签
      const thinkingEnd = state.buffer.indexOf('</thinking>');
      if (thinkingEnd === -1) {
        // 没有找到结束标签，检查是否可能是不完整的标签
        if (state.buffer.length > 8 && !state.buffer.includes('<')) {
          // 安全地输出所有内容作为思维链
          uiStore.appendThinkingContent(state.buffer);
          state.buffer = '';
        } else if (state.buffer.length > 60) {
          // 缓冲区太长，输出前面的内容
          const safeLen = state.buffer.lastIndexOf('<');
          if (safeLen > 0) {
            uiStore.appendThinkingContent(state.buffer.substring(0, safeLen));
            state.buffer = state.buffer.substring(safeLen);
          } else {
            uiStore.appendThinkingContent(state.buffer);
            state.buffer = '';
          }
        }
        break;
      } else {
        // 找到 </thinking> 标签
        if (thinkingEnd > 0) {
          // 标签前有思维链内容
          uiStore.appendThinkingContent(state.buffer.substring(0, thinkingEnd));
        }
        state.buffer = state.buffer.substring(thinkingEnd + 11); // 跳过 </thinking>
        state.inThinking = false;
        uiStore.endThinkingPhase();
      }
    }
  }

  // appendStreamingContent above is retained for thinking-tag parsing compatibility;
  // replace it synchronously with the only player-safe preview before Vue renders.
  uiStore.setStreamingContent(extractStreamingNarrativeText(state.rawResponse));
};

// 🔥 重置流式解析状态
const resetStreamParseState = () => {
  // 保存当前思维链内容，以便传输完成后仍可查看
  if (uiStore.thinkingContent) {
    lastThinkingContent.value = uiStore.thinkingContent;
  }
  streamParseState.value = { inThinking: false, buffer: '', rawResponse: '' };
  uiStore.clearThinkingContent();
  uiStore.clearStreamingContent();
};

const inputRef = ref<HTMLTextAreaElement>();
const contentAreaRef = ref<HTMLDivElement>();
const memoryExpanded = ref(false);

// 🔥 用户滚动检测：当用户手动向上滚动时，停止自动跟随
const userHasScrolledUp = ref(false);
const showMemorySection = ref(true);

const handleChatPrefill = async ({ text, focus }: ChatBusPayload) => {
  uiStore.userInputText = text;
  if (focus !== false) {
    await nextTick();
    inputRef.value?.focus();
  }
};

const handleChatSend = async ({ text, focus }: ChatBusPayload) => {
  if (uiStore.isAIProcessing) {
    toast.warning(t('AI正在生成中，请稍后再试'));
    return;
  }
  uiStore.userInputText = text;
  if (focus !== false) {
    await nextTick();
    inputRef.value?.focus();
  }
  await nextTick();
  sendMessage();
};

// 切换记忆面板
const toggleMemory = () => {
  memoryExpanded.value = !memoryExpanded.value;
};

// 恢复AI处理状态（从sessionStorage）
const restoreAIProcessingState = () => {
  const saved = sessionStorage.getItem('ai-processing-state');
  if (saved === 'true') {
    // 请求无法跨页面重载继续；恢复为“生成中”只会留下一个无法解除的禁用输入框。
    console.warn('[状态恢复] 清除页面重载遗留的AI处理状态');
    uiStore.resetStreamingState();
    sessionStorage.removeItem('ai-processing-state');
    sessionStorage.removeItem('ai-processing-timestamp');
  }
};

// 持久化AI处理状态到sessionStorage
const persistAIProcessingState = () => {
  if (uiStore.isAIProcessing) {
    sessionStorage.setItem('ai-processing-state', 'true');
    sessionStorage.setItem('ai-processing-timestamp', Date.now().toString());
  } else {
    sessionStorage.removeItem('ai-processing-state');
    sessionStorage.removeItem('ai-processing-timestamp');
  }
};

// 强制清除AI处理状态的方法
const forceResetAIProcessingState = () => {
  console.log('[强制重置] 清除AI处理状态和会话存储');
  // 取消所有正在进行的AI请求（包括重试中的）
  abortInFlightNaturalIntent();
  aiService.cancelAllRequests();
  aiResetToken += 1;
  uiStore.resetStreamingState();
  streamingMessageIndex.value = null;
  rawStreamingContent.value = '';
  persistAIProcessingState();
  toast.info(t('AI处理状态已重置'));
};


// 行动选择相关
const showActionModal = ref(false);
const selectedAction = ref<ActionItem | null>(null);
const selectedTime = ref(1);
const customTime = ref(1);
const selectedOption = ref('');

// 行动类型定义
interface ActionItem {
  name: string;
  icon: string;
  type: string;
  description: string;
  timeRequired?: boolean;
  options?: Array<{ key: string; label: string }>;
  iconComponent?: unknown;
}

interface ActionCategory {
  name: string;
  icon: string;
  actions: ActionItem[];
}

const { t } = useI18n();
const router = useRouter();
const characterStore = useCharacterStore();
const actionQueue = useActionQueueStore();
const uiStore = useUIStore();
let aiResetToken = 0;
let ownedQingyuTurnId: string | null = null;

/** 本组件拥有的回合清理：切档与卸载共用。只失效/取消自己的 turn，不清后来者的 busy。 */
const abandonOwnedGameTurn = () => {
  cancelModuleBackground();
  yieldBackgroundAudit();
  aiResetToken += 1;
  const owned = ownedQingyuTurnId;
  ownedQingyuTurnId = null;
  const active = peekActiveQingyuTurnId();
  if (owned) {
    invalidateQingyuTurnLongRequests(owned);
    aiService.abortQingyuTurnRequests(owned);
  }
  if (!active || active === owned) {
    abortInFlightNaturalIntent();
    uiStore.resetStreamingState();
    streamingMessageIndex.value = null;
    rawStreamingContent.value = '';
    uiStore.setCurrentGenerationId(null);
    uiStore.setAIProcessing(false);
    persistAIProcessingState();
  }
};
const gameStateStore = useGameStateStore();
const currentTravelCard = computed(() => getTravelCard(gameStateStore.toSaveData()));
// 本局已结束（玩家走进绝路）。引擎侧 `runtime.gameOver` 是唯一真值来源——
// 结局正文由叙述在本轮已经写完，这里只负责收住界面：封输入，只留退路。
const scenarioGameOver = computed<{ endingId: string; title: string; facts: string[] } | null>(() => {
  const runtime = (gameStateStore.worldState as any)?.剧本模组;
  const over = runtime?.gameOver;
  return over?.endingId ? over : null;
});
const scenarioEndingImage = computed(() => {
  const over = (gameStateStore.worldState as any)?.剧本模组?.gameOver;
  if (!over?.endingId) return undefined;
  return resolveEndingImage(over.presentation?.image || endingPresentation(over).image);
});
const worldSimulationPlaytestFinished = computed(() => {
  const marker = (gameStateStore.systemExtensions as any)?.六朝世界试玩;
  const runtime = (gameStateStore.worldState as any)?.剧本模组;
  return marker?.kind === WORLD_SIMULATION_PLAYTEST_KIND
    && runtime?.storyMode === 'world_sim'
    && !getCurrentWorldSituation(runtime);
});
const xingyuehuLandingFinished = computed(() => isXingyuehuLandingPlaytestFinished(gameStateStore.toSaveData()));
const xingyuehuPlaytestFinished = computed(() => (
  isXingyuehuQuestPlaytestFinished(gameStateStore.toSaveData()) || xingyuehuLandingFinished.value
));
const nanhuangDemoFinished = computed(() => isNanhuangDemoFinished(gameStateStore.toSaveData()));
const playtestFinished = computed(() => worldSimulationPlaytestFinished.value || xingyuehuPlaytestFinished.value || nanhuangDemoFinished.value);
const isTavernEnvFlag = isTavernEnv();
const enhancedActionQueue = EnhancedActionQueueManager.getInstance();
const bidirectionalSystem = AIBidirectionalSystem;
type ScenarioEngineActionSelection = ScenarioOpportunityActionSelection | ScenarioEventActionSelection | WuyuanOpenWorldSelection | BaihuGambleRefusalSelection;
const selectedScenarioEngineAction = ref<ScenarioEngineActionSelection | null>(null);
/** 固定事件链上识别失败而停下时的常驻提示；玩家改输入或重新发送即清除。 */
const intentHoldMessage = ref('');
const qingyuOpeningDemo = computed(() => isQingyuOpeningPlaytestSave(gameStateStore.toSaveData()));
const showScenarioActionMechanics = (option: ScenarioEngineActionSelection) => (
  !qingyuOpeningDemo.value || option.source !== 'event_engine'
);
const scenarioEngineActionOptions = computed<ScenarioEngineActionSelection[]>(() => {
  if (isAIProcessing.value) return [];
  const live = gameStateStore.toSaveData();
  const save = live ? advanceScenarioRuntime(live).saveData : null;
  if (!save || scenarioGameOver.value) return [];
  const openWorldActions = getWuyuanOpenWorldSelections(save);
  const gambleRefusalActions = getBaihuGambleRefusalSelections(save);
  const eventActions = getCurrentStoryEventActions(save)
    // 五原落奴这拍由“先走到点心铺 → 选择应对过程 → 收束既定被抓事实”的局部合同承接。
    // 隐藏旧的宽泛单按钮，避免绕过移动、代价和失败转新状态。
    .filter(action => !(openWorldActions.length && action.eventId === 'lcq.event.s02_04'));
  return [
    ...eventActions,
    ...getCurrentStoryExplorationActions(save),
    ...getTrackedStoryOpportunityActions(save),
    ...openWorldActions,
    ...gambleRefusalActions,
  ];
});
// 重要桥段推进卡片（剧情策划裁定 A）：卡片动作不再出现在正文末尾的小按钮里，只能点卡片推进。
const keyBeatCard = computed(() => getActiveKeyBeatCard(gameStateStore.toSaveData()));
const keyBeatHighlight = ref(false);
let keyBeatConfirmedByCard = false;
// 锁定时只显示固定选项（见下方分支区块）；未激活的锁选项（如决定步之前的致命选项）不提前显示。
const engineButtonOptions = computed(() => playtestFinished.value || branchDecision.value ? [] :
  scenarioEngineActionOptions.value.filter(option => !isKeyBeatCardAction(option as { source?: string; eventId?: string; actionId?: string })
    && !isDormantLockedOption(option as unknown as BranchDecisionCandidate)));
/** 选项填入输入框时使用的原句（与 selectScenarioEngineAction 一致）。 */
const engineOptionLine = (option: ScenarioEngineActionSelection): string => (
  option.source === 'opportunity_engine'
  || option.source === 'open_world_engine'
  || option.source === BAIHU_GAMBLE_REFUSAL_SOURCE
    ? option.actionText
    : option.playerLine
);
// 剧情分支点：只能在给定选项中选，不接受自由输入（判定见 branchDecision.ts）。
// 本局已结束（如选了致命选项）时不再锁：让结局卡片与返回入口显示出来。
const branchDecision = computed(() => scenarioGameOver.value ? null :
  detectBranchDecision(scenarioEngineActionOptions.value as unknown as Array<BranchDecisionCandidate & ScenarioEngineActionSelection>));
const branchDecisionReady = computed(() => branchDecisionAllowsSend(
  branchDecision.value,
  selectedScenarioEngineAction.value as unknown as (BranchDecisionCandidate & ScenarioEngineActionSelection) | null,
  inputText.value,
  engineOptionLine,
));
const stageDepartureOffer = computed(() => {
  const save = gameStateStore.toSaveData();
  return save && !scenarioGameOver.value && !isNanhuangDemoFinished(save) ? getStageDepartureOffer(save) : null;
});
const stageDeparturePending = ref(false);

const openEventsPanel = () => {
  router.push('/game/events');
};

const departToNextStage = async () => {
  const offer = stageDepartureOffer.value;
  if (!offer || stageDeparturePending.value || isAIProcessing.value) return;
  stageDeparturePending.value = true;
  try {
    const result = await gameStateStore.transitionToNextStage(offer.nextStageId);
    if (!result.ok) {
      toast.warning(result.reason || '此刻还不能启程');
      return;
    }
    toast.success(result.toName ? `已启程：${result.toName}` : '已启程');
  } catch (error) {
    toast.error(String((error as Error)?.message || error));
  } finally {
    stageDeparturePending.value = false;
  }
};

// 流式输出状态
const streamingMessageIndex = ref<number | null>(null);
// 🔥 使用全局流式传输开关（从 uiStore 获取，切换页面不丢失）
const useStreaming = computed({
  get: () => uiStore.useStreaming,
  set: (val) => { uiStore.useStreaming = val; }
});

// 🔥 全局标志：防止重复注册事件监听器（使用 window 对象存储，确保全局唯一）
const GLOBAL_EVENT_KEY = '__mainGamePanel_eventListenersRegistered__';
const globalWindowState = window as unknown as Record<string, unknown>;
if (!globalWindowState[GLOBAL_EVENT_KEY]) {
  globalWindowState[GLOBAL_EVENT_KEY] = false;
}

// 🔥 存储事件监听器引用，用于清理（也存储在全局）
const GLOBAL_HANDLERS_KEY = '__mainGamePanel_eventHandlers__';
if (!globalWindowState[GLOBAL_HANDLERS_KEY]) {
  globalWindowState[GLOBAL_HANDLERS_KEY] = {};
}

// 图片上传相关
const selectedImages = ref<File[]>([]);
const imageInputRef = ref<HTMLInputElement>();

// 打开图片选择器
const openImagePicker = () => {
  imageInputRef.value?.click();
};

// 处理图片选择
const handleImageSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    const newFiles = Array.from(target.files);
    selectedImages.value.push(...newFiles);
    console.log('[图片上传] 已选择图片:', newFiles.length, '张');
    toast.success(`已选择 ${newFiles.length} 张图片`);
  }
};

// 移除已选择的图片
const removeImage = (index: number) => {
  selectedImages.value.splice(index, 1);
  toast.info('已移除图片');
};

// 清空所有图片
const clearImages = () => {
  selectedImages.value = [];
  if (imageInputRef.value) {
    imageInputRef.value.value = '';
  }
};

// 获取图片预览 URL
const getImagePreviewUrl = (file: File): string => {
  return URL.createObjectURL(file);
};

// 显示状态变更详情
const showStateChanges = (log: StateChangeLog | undefined) => {
  if (!log || !log.changes || log.changes.length === 0) {
    toast.info('本次对话无变更记录');
    return;
  }
  // [核心改造] 调用 uiStore 中新的方法来打开专属的 StateChangeViewer 弹窗
  uiStore.openStateChangeViewer(log);
};

// 当前显示的叙述内容
// 文本内容优先使用短期记忆最后一条，actionOptions和stateChanges从叙事历史获取
const currentNarrative = computed(() => {
  const narrativeHistory = gameStateStore.narrativeHistory;
  const shortTermMemory = gameStateStore.memory?.短期记忆;
  const currentTimeString = formatCurrentTime();
  const save = gameStateStore.toSaveData();
  const stageEntry = save ? getStageEntryPresentation(save) : null;

  // 切关后先显示目标关 opening，避免旧关最后一段正文继续占据主阅读面，
  // 同时右栏与确定性动作已经属于新关。首个新关正文落账后该展示态自动消费。
  if (stageEntry) {
    return {
      type: 'stage_entry',
      image: undefined as string | undefined,
      content: stageEntry.text,
      time: currentTimeString,
      stateChanges: { changes: [] },
      actionOptions: []
    };
  }

  // 优先从短期记忆获取文本内容
  let content = '';
  if (shortTermMemory && shortTermMemory.length > 0) {
    // 短期记忆使用push添加，最新的在末尾
    const latestMemory = shortTermMemory[shortTermMemory.length - 1];
    content = latestMemory.replace(/^【.*?】\s*/, ''); // 移除时间前缀
  } else if (narrativeHistory && narrativeHistory.length > 0) {
    // 回退到叙事历史
    content = narrativeHistory[narrativeHistory.length - 1].content.replace(/^【.*?】\s*/, '');
  }

  // 从叙事历史获取actionOptions和stateChanges
  if (narrativeHistory && narrativeHistory.length > 0) {
    const latestNarrative = narrativeHistory[narrativeHistory.length - 1];
    const runtime = (gameStateStore.worldState as any)?.剧本模组;
    const notices = getWorldSimulationPresentationNotices(runtime, latestNarrative.stateChanges?.changes);
    const noticeText = notices
      .map(notice => notice.detail)
      .join('\n\n');
    return {
      type: latestNarrative.type || 'narrative',
      userIntent: (latestNarrative as { userIntent?: string }).userIntent || '',
      content: [latestNarrative.content.replace(/^【.*?】\s*/, '') || content || '...', noticeText].filter(Boolean).join('\n\n'),
      time: currentTimeString,
      stateChanges: latestNarrative.stateChanges || { changes: [] },
      image: latestNarrative.image,
      actionOptions: latestNarrative.actionOptions || []
    };
  }

  // 无数据时的默认内容
  return {
    type: 'system',
    image: undefined as string | undefined,
    userIntent: '',
    content: content || '开局生成失败，请检查API上下文长度是否足够，是否使用支持流式的API，然后返回主页重新开始生成。',
    time: currentTimeString,
    stateChanges: { changes: [] },
    actionOptions: []
  };
});

// 绘图相关逻辑
const isGeneratingImage = ref(false);
const showImageModal = ref(false);
const currentSceneImage = ref('');
const isImageFullScreen = ref(false);

const generateSceneImage = async () => {
  if (isGeneratingImage.value) return;
  
  const text = currentNarrative.value?.content;
  if (!text || text.length < 5) {
    toast.warning('当前剧情内容过少，无法生成');
    return;
  }

  isGeneratingImage.value = true;
  try {
    // 构建提示词
    const location = gameStateStore.location?.描述 || '未知地点';
    const basePrompt = `中国古风水墨画，修仙玄幻风格，高品质，细节丰富。当前地点：${location}。剧情描述：`;
    // 截取前500字作为提示词
    const prompt = basePrompt + text.substring(0, 500);

    // TODO: 实现图片生成功能
    // const imageUrl = await aiService.generateImage(prompt);
    // currentSceneImage.value = imageUrl;
    // showImageModal.value = true;
    toast.warning('场景绘卷功能暂未实现');
    console.log('绘图提示词:', prompt);
  } catch (error) {
    console.error('绘图失败:', error);
    toast.error(`绘图失败: ${error instanceof Error ? error.message : '未知错误'}`);
  } finally {
    isGeneratingImage.value = false;
  }
};

const closeImageModal = () => {
  showImageModal.value = false;
  isImageFullScreen.value = false;
};

const toggleFullScreenImage = () => {
  isImageFullScreen.value = !isImageFullScreen.value;
};

const saveImageToGallery = () => {
  // TODO: 实现画廊功能，目前仅做提示
  toast.success('已保存到临时画册 (功能开发中)');
  closeImageModal();
};

const latestMessageText = ref<string | null>(null); // 用于存储单独的text部分

// 短期记忆设置 - 可配置
const maxShortTermMemories = ref(5); // 默认5条，与记忆中心同步
const maxMidTermMemories = ref(25); // 默认25条触发阈值
const midTermKeepCount = ref(8); // 默认保留8条最新的中期记忆
// 长期记忆无限制，不设上限

// 从设置加载记忆配置
const loadMemorySettings = async () => {
  try {
    // 🔥 [新架构] 直接从 localStorage 读取配置
    // 配置信息不需要存储在酒馆变量中
    const memorySettings = localStorage.getItem('memory-settings');
    if (memorySettings) {
      const settings = JSON.parse(memorySettings);
      const shortLimit = typeof settings.shortTermLimit === 'number' ? settings.shortTermLimit : settings.maxShortTerm;
      const midTrigger = typeof settings.midTermTrigger === 'number' ? settings.midTermTrigger : settings.maxMidTerm;
      if (shortLimit) maxShortTermMemories.value = shortLimit;
      if (midTrigger) maxMidTermMemories.value = midTrigger;
      if (settings.midTermKeep) midTermKeepCount.value = settings.midTermKeep;
      console.log('[记忆设置] 已从localStorage加载配置:', {
        短期记忆上限: maxShortTermMemories.value,
        中期记忆触发阈值: maxMidTermMemories.value,
        中期记忆保留数量: midTermKeepCount.value
      });
    }
  } catch (error) {
    console.warn('[记忆设置] 加载配置失败，使用默认值:', error);
  }
};

// 保存记忆配置
const saveMemorySettings = () => {
  try {
    const raw = localStorage.getItem('memory-settings');
    const existing = raw ? JSON.parse(raw) : {};
    const settings = {
      ...existing,
      shortTermLimit: maxShortTermMemories.value,
      midTermTrigger: maxMidTermMemories.value,
      midTermKeep: midTermKeepCount.value,
    };
    localStorage.setItem('memory-settings', JSON.stringify(settings));
    console.log('[记忆设置] 已保存配置:', settings);
  } catch (error) {
    console.warn('[记忆设置] 保存配置失败:', error);
  }
};

// 更新记忆配置的外部接口
const updateMemorySettings = (shortTerm?: number, midTerm?: number) => {
  if (shortTerm !== undefined && shortTerm > 0) {
    maxShortTermMemories.value = shortTerm;
  }
  if (midTerm !== undefined && midTerm > 0) {
    maxMidTermMemories.value = midTerm;
  }
  saveMemorySettings();
  console.log('[记忆设置] 配置已更新:', {
    短期记忆上限: maxShortTermMemories.value,
    中期记忆上限: maxMidTermMemories.value
  });
};

// 暴露给父组件（如果需要）
defineExpose({
  updateMemorySettings,
  getMemorySettings: () => ({
    maxShortTerm: maxShortTermMemories.value,
    maxMidTerm: maxMidTermMemories.value
  })
});

// 计算属性：检查是否有激活的角色
const hasActiveCharacter = computed(() => !!gameStateStore.character);


// 计算属性：是否可以回滚
const canRollback = computed(() => {
  const profile = characterStore.activeCharacterProfile;
  if (!profile || profile.模式 !== '单机') return false;
  const lastConversation = profile.存档列表?.['上次对话'];
  // 🔥 修复：检查保存时间而不是存档数据，因为存档数据可能在IndexedDB中而不在内存中
  return lastConversation?.保存时间 !== null && lastConversation?.保存时间 !== undefined;
});

// 回滚到上次对话
const rollbackToLastConversation = async () => {
  if (!canRollback.value) {
    toast.warning('没有可回滚的存档');
    return;
  }

  uiStore.showRetryDialog({
    title: '回滚确认',
    message: '确定要回滚到上次对话前的状态吗？当前进度将被替换。',
    confirmText: '确认回滚',
    cancelText: '取消',
    onConfirm: async () => {
      try {
        await characterStore.rollbackToLastConversation();
        toast.success('已回滚到上次对话前的状态');
      } catch (error) {
        console.error('回滚失败:', error);
        toast.error(`回滚失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    },
    onCancel: () => {}
  });
};

// 快照相关
const showSnapshotMenu = ref(false);
const snapshots = computed(() => {
  const active = characterStore.rootState.当前激活存档;
  if (!active) return [];
  return getSnapshots(active.角色ID, active.存档槽位).reverse();
});

const formatSnapshotTime = (timestamp: number) => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return new Date(timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const rollbackToSnapshot = async (snapshotId: string) => {
  showSnapshotMenu.value = false;
  const active = characterStore.rootState.当前激活存档;
  if (!active) return;

  uiStore.showRetryDialog({
    title: '回退确认',
    message: '确定要回退到此快照吗？当前进度将被替换。',
    confirmText: '确认回退',
    cancelText: '取消',
    onConfirm: async () => {
      try {
        const { getSnapshot, restoreSnapshot } = await import('@/utils/snapshotManager');
        const snap = getSnapshot(active.角色ID, active.存档槽位, snapshotId);
        if (!snap) throw new Error('快照不存在');

        const currentData = gameStateStore.toSaveData();
        if (!currentData) throw new Error('无法获取当前数据');

        const restored = restoreSnapshot(currentData, snap);
        await gameStateStore.loadFromSaveData(restored);

        const profile = characterStore.activeCharacterProfile;
        if (profile?.模式 === '单机' && profile.存档列表) {
          const slot = profile.存档列表[active.存档槽位];
          if (slot) {
            slot.存档数据 = restored;
            const { saveSaveData } = await import('@/utils/indexedDBManager');
            await saveSaveData(active.角色ID, active.存档槽位, restored, {
              localOnly: profile.隔离试玩信息?.localOnly === true,
            });
          }
        }

        uiStore.resetStreamingState();
        uiStore.lastSentUserIntentText = '';

        // 删除该快照及之后的所有快照
        const { getSnapshots } = await import('@/utils/snapshotManager');
        const allSnapshots = getSnapshots(active.角色ID, active.存档槽位);
        const snapIndex = allSnapshots.findIndex(s => s.id === snapshotId);
        if (snapIndex !== -1) {
          const { deleteSnapshotsFrom } = await import('@/utils/snapshotManager');
          deleteSnapshotsFrom(active.角色ID, active.存档槽位, snapIndex);
        }

        toast.success('已回退到快照');
      } catch (error) {
        console.error('回退失败:', error);
        toast.error(`回退失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    },
    onCancel: () => {}
  });
};

// 回退到最后一条快照
const rollbackToLastSnapshot = async () => {
  if (snapshots.value.length === 0) return;
  const lastSnapshot = snapshots.value[snapshots.value.length - 1];
  await rollbackToSnapshot(lastSnapshot.id);
};


// 扁平化的行动列表，用于简化UI显示
const flatActions = computed(() => {
  const actions: ActionItem[] = [];
  actionCategories.value.forEach(category => {
    actions.push(...category.actions);
  });
  return actions;
});





// 时间选项
const timeOptions = ref([
  { label: '1天', value: 1 },
  { label: '3天', value: 3 },
  { label: '7天', value: 7 },
  { label: '30天', value: 30 }
]);

// 行动分类数据
const actionCategories = ref<ActionCategory[]>([
  {
    name: '修炼',
    icon: '',
    actions: [
      {
        name: '基础修炼',
        icon: '⚡',
        type: 'cultivation',
        description: '吐纳天地灵气，淬炼自身修为，是提升境界的根本之法。',
        timeRequired: true
      },
      {
        name: '炼体',
        icon: 'Shield',
        iconComponent: Shield,
        type: 'cultivation',
        description: '以灵气或外力锤炼肉身，强化筋骨皮膜，增强体魄与防御。',
        timeRequired: true
      },
      {
        name: '冥想',
        icon: 'BrainCircuit',
        iconComponent: BrainCircuit,
        type: 'cultivation',
        description: '沉入心海，观想天地，可稳固心境，提升神识，偶有顿悟。',
        timeRequired: true
      }
    ]
  },
  {
    name: '探索',
    icon: '',
    actions: [
      {
        name: '野外探索',
        icon: '',
        type: 'exploration',
        description: '前往野外探索，寻找机缘',
        options: [
          { key: 'nearby', label: '附近区域' },
          { key: 'far', label: '远方区域' },
          { key: 'dangerous', label: '危险区域' }
        ]
      },
      {
        name: '城镇逛街',
        icon: '',
        type: 'exploration',
        description: '在城镇中闲逛，了解信息',
        options: [
          { key: 'market', label: '集市' },
          { key: 'tavern', label: '酒楼' },
          { key: 'shop', label: '商铺' }
        ]
      }
    ]
  },
  {
    name: '交流',
    icon: '',
    actions: [
      {
        name: '拜访朋友',
        icon: '',
        type: 'social',
        description: '拜访认识的朋友',
        options: [
          { key: 'random', label: '随机拜访' },
          { key: 'close', label: '亲密朋友' }
        ]
      },
      {
        name: '结交新友',
        icon: '',
        type: 'social',
        description: '主动结交新的朋友'
      }
    ]
  },
  {
    name: '其他',
    icon: '',
    actions: [
      {
        name: '休息',
        icon: '',
        type: 'other',
        description: '好好休息，恢复精神',
        timeRequired: true
      },
      {
        name: '查看状态',
        icon: '',
        type: 'other',
        description: '查看当前的详细状态'
      }
    ]
  }
]);

if (!isTavernEnvFlag) {
  actionCategories.value = actionCategories.value.map((category) => ({
    ...category,
    actions: category.actions.map((action) => {
      const filteredOptions = action.options?.filter((option) => option.key !== 'tavern');
      return filteredOptions ? { ...action, options: filteredOptions } : action;
    })
  }));
}

// 行动选择器函数
const showActionSelector = () => {
  showActionModal.value = true;
};

const hideActionSelector = () => {
  showActionModal.value = false;
};

const selectAction = (action: ActionItem) => {
  selectedAction.value = action;
  showActionModal.value = false;

  // 重置选择
  selectedTime.value = 1;
  customTime.value = 1;
  selectedOption.value = '';

  // 如果不需要配置，直接执行
  if (!action.timeRequired && !action.options) {
    confirmAction();
  }
};

const cancelAction = () => {
  abortInFlightNaturalIntent();
  selectedAction.value = null;
  selectedTime.value = 1;
  customTime.value = 1;
  selectedOption.value = '';
};

const confirmAction = () => {
  if (!selectedAction.value) return;

  let actionText = selectedAction.value.name;

  // 添加时间信息
  if (selectedAction.value.timeRequired) {
    const time = customTime.value > 0 ? customTime.value : selectedTime.value;
    actionText += `（${time}天）`;
  }

  // 添加选项信息
  if (selectedOption.value && selectedAction.value.options) {
    const option = selectedAction.value.options.find(opt => opt.key === selectedOption.value);
    if (option) {
      actionText += `（${option.label}）`;
    }
  }

  // 填充到输入框
  inputText.value = actionText;

  // 清理状态
  cancelAction();

  // 聚焦输入框
  nextTick(() => {
    inputRef.value?.focus();
  });
};

// 移除中期记忆临时数组，防止数据丢失
// const midTermMemoryBuffer = ref<string[]>([]);

// 短期记忆获取 - 显示所有短期记忆
const recentMemories = computed(() => {
  const mems = gameStateStore.memory?.短期记忆;
  if (mems && mems.length > 0) {
    // 短期记忆使用push添加，数组本身就是时间顺序（最旧的在前，最新的在后）
    // 返回副本以避免在 computed 中产生副作用
    return mems.slice();
  }
  return [];
});

const isCanceledError = (error: unknown): boolean => {
  if (!error) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /请求已取消|abort|aborted|canceled|cancelled/i.test(message);
};

// 重新请求AI响应（当结构验证失败时）
const retryAIResponse = async (
  userMessage: string,
  character: CharacterProfile,
  previousErrors: string[],
  maxRetries: number = 2
): Promise<GM_Response | null> => {
  const saveForRetryBudget = gameStateStore.toSaveData();
  if (
    remainingQingyuTurnLongRequests() === 0
    || (saveForRetryBudget && usesFixedScenarioInventory(saveForRetryBudget))
  ) {
    console.warn('[AI响应重试] 清羽/固定道具合同回合不再发起格式重试长请求');
    return null;
  }
  console.log('[AI响应重试] 开始重试，之前的错误:', previousErrors);
  const resetSnapshot = aiResetToken;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!uiStore.isAIProcessing || aiResetToken !== resetSnapshot) {
        console.log('[AI响应重试] 已中止：检测到重置状态');
        return null;
      }
      console.log(`[AI响应重试] 第${attempt}次尝试`);

      // 🔥 重置流式内容，准备新的流式输出
      uiStore.setStreamingContent('');
      rawStreamingContent.value = '';

      // 🔥 生成新的 generation_id 用于流式传输
      const retryGenerationId = `gen_retry_${attempt}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      uiStore.setCurrentGenerationId(retryGenerationId);

      // 在用户消息中添加结构要求
      const enhancedMessage = `${userMessage}

## 输出格式（必须严格遵守）

**重要：以下3个字段都是必需的，缺一不可！**

{
  "text": "Narrative text(中文简体，300-500字，关键场景最多700字，只写本次行动的即时过程和直接结果)",
  "mid_term_memory": "Brief summary",
  "tavern_commands": [{"action": "Action", "key": "key.path", "value": Value/List}]
}

下面为tavern_commands的行动命令类型

# Action Types

| Action | Purpose | Example |
|--------|---------|---------|
| set | Replace/Set | Update state |
| add | Increase/Decrease | Change numerical values |
| push | Add to array | Record history |
| delete | Remove field | Clear data |
| pull | Remove from array | Remove array element |

---


上次响应的问题：${previousErrors.join(', ')}
请修正这些问题并确保结构正确。`;

      const options: Record<string, unknown> = {
        onProgressUpdate: (progress: string) => {
          console.log('[AI重试进度]', progress);
        },
        playerIntentText: uiStore.lastSentUserIntentText,
        useStreaming: useStreaming.value, // 🔥 启用流式传输
        shouldAbort: () => !uiStore.isAIProcessing || aiResetToken !== resetSnapshot,
        generation_id: retryGenerationId  // 🔥 传递 generation_id
      };

      // 非酒馆环境（网页版自定义API）：需要设置 onStreamChunk 才能实时渲染
      if (!isTavernEnvFlag) {
        console.log('[网页版流式-重试] 设置 onStreamChunk 回调');
        resetStreamParseState(); // 重置解析状态
        (options as any).onStreamChunk = (chunk: string) => {
          if (!useStreaming.value || !chunk) return;
          if (aiResetToken !== resetSnapshot || !uiStore.isAIProcessing) return;
          console.log('[网页版流式-重试] 收到chunk:', chunk.length, '字符');
          handleStreamChunk(chunk);
        };
      }

      const aiResponse = await bidirectionalSystem.processPlayerAction(
        enhancedMessage,
        character,
        options
      );

      if (!uiStore.isAIProcessing || aiResetToken !== resetSnapshot) {
        console.log('[AI响应重试] 已中止：检测到重置状态');
        return null;
      }

      if (aiResponse) {
        if (aiResponse.generationError) throw Object.assign(new Error(aiResponse.generationError.message), { code: aiResponse.generationError.code });
        if (aiResponse.outputTruncated) return aiResponse;
        const validation = validateProcessedAIResponse(aiResponse);
        if (validation.isValid) {
          console.log(`[AI响应重试] 第${attempt}次尝试成功`);
          return aiResponse;
        } else {
          console.warn(`[AI响应重试] 第${attempt}次尝试验证失败:`, validation.errors);
          previousErrors = validation.errors;
          // 继续下一次重试
        }
      }
    } catch (error) {
      if (isAiRequestTimeout(error) || (error && typeof error === 'object' && 'code' in error && (error.code === 'AI_REQUEST_TIMEOUT' || error.code === 'PLAYER_AGENCY_VIOLATION'))) throw error;
      if (isCanceledError(error) || !uiStore.isAIProcessing || aiResetToken !== resetSnapshot) {
        console.log('[AI响应重试] 已取消，停止重试');
        return null;
      }
      console.error(`[AI响应重试] 第${attempt}次尝试出错:`, error);
      // 继续下一次重试
    }
  }

  console.error('[AI响应重试] 所有重试尝试都失败了');
  return null;
};


// 存储原始流式内容（用于解析完整JSON）
const rawStreamingContent = ref('');
// 记录最近一次点击的行动推荐（用于判定“发送来源/被覆盖”）
const lastSelectedActionOption = ref('');

// 检查动作是否可撤回
const isUndoableAction = (action: { type?: string }): boolean => {
  if (!action.type) return false;
  // NPC交互类操作不支持撤回，只能删除
  const npcInteractionTypes = ['npc_trade', 'npc_request', 'npc_steal'];
  if (npcInteractionTypes.includes(action.type)) {
    return false;
  }
  // 其他操作支持撤回
  return ['equip', 'unequip', 'use', 'cultivate'].includes(action.type);
};

// 动作队列管理方法
const clearActionQueue = async () => {
  actionQueue.clearActions();
  toast.success('操作记录已清空');
};

const removeActionFromQueue = async (index: number) => {
  if (index >= 0 && index < actionQueue.pendingActions.length) {
    const action = actionQueue.pendingActions[index];

    // NPC交互类操作不支持撤回，只能删除
    const npcInteractionTypes = ['npc_trade', 'npc_request', 'npc_steal'];
    if (action.type && npcInteractionTypes.includes(action.type)) {
      actionQueue.removeAction(action.id);
      toast.success('已移除NPC交互动作');
      return;
    }

    // 如果是装备、卸下、使用或修炼类操作，尝试按名称精准撤回
    if (action.type && ['equip', 'unequip', 'use', 'cultivate'].includes(action.type) && action.itemName) {
      const success = await enhancedActionQueue.undoByItemName(action.type as 'equip' | 'unequip' | 'use' | 'cultivate', action.itemName);
      if (success) {
        toast.success('已撤回并恢复');
        return;
      }
    }

    // 普通删除操作
    actionQueue.removeAction(action.id);
    toast.success('已移除动作');
  }
};

// 选择行动选项（默认替换输入框内容）
const selectActionOption = (option: string) => {
  const trimmed = (option || '').trim();
  if (!trimmed) return;

  lastSelectedActionOption.value = trimmed;
  selectedScenarioEngineAction.value = null;
  inputText.value = trimmed;

  nextTick(() => {
    inputRef.value?.focus?.();
    adjustTextareaHeight();
  });
};

const confirmKeyBeatCard = async (option: KeyBeatCardOption) => {
  keyBeatHighlight.value = false;
  selectScenarioEngineAction(option.selection);
  keyBeatConfirmedByCard = true;
  await sendMessage();
};

// 锁定时没有输入框：点固定选项即选中并发送（仍走原有结构化动作与本地合同）。
const confirmBranchDecision = async (option: ScenarioEngineActionSelection) => {
  selectScenarioEngineAction(option);
  await sendMessage();
};

const selectScenarioEngineAction = (option: ScenarioEngineActionSelection) => {
  selectedScenarioEngineAction.value = option;
  const playerLine = engineOptionLine(option);
  lastSelectedActionOption.value = playerLine;
  inputText.value = playerLine;
  nextTick(() => {
    inputRef.value?.focus?.();
    adjustTextareaHeight();
  });
};

const sendMessage = async (execution?: { skipPreflight?: boolean; resolution?: JudgementResolution }) => {
  // 本次发送是否由点推进卡片发起；先取出再清零，任何提前返回都不会把确认带到下一次发送。
  const confirmedByCard = keyBeatConfirmedByCard;
  keyBeatConfirmedByCard = false;
  // @click="sendMessage" 会把鼠标事件当作第一个参数传进来；只有带判定结果/跳过预检的二次执行才算"已确认的后续执行"。
  const isFollowUpExecution = Boolean(execution && typeof execution === 'object'
    && ('resolution' in execution || 'skipPreflight' in execution));
  if (scenarioGameOver.value) {
    toast.info('本局已经结束');
    return;
  }
  if (playtestFinished.value) {
    toast.info('本次试玩纵切已经结束，请先提交反馈');
    return;
  }
  intentHoldMessage.value = '';
  // 剧情分支点：只接受已选中的选项原句；判定确认等后续执行沿用已选动作，不再拦。
  if (!isFollowUpExecution && branchDecision.value && !branchDecisionReady.value) {
    toast.info(`${BRANCH_DECISION_TITLE}：请从选项中选择一项后再发送`);
    return;
  }
  const actionQueueText = actionQueue.getActionPrompt();
  const judgementAction = composeJudgementAction(inputText.value, actionQueueText);
  if (!judgementAction) return;
  if (isAIProcessing.value) {
    toast.warning('AI正在处理中，请稍等...');
    return;
  }
  uiStore.setAIProcessing(true);
  persistAIProcessingState();
  if (!hasActiveCharacter.value) {
    uiStore.setAIProcessing(false);
    persistAIProcessingState();
    toast.error('请先选择或创建角色');
    return;
  }

  if (pendingJudgement.value && !execution?.skipPreflight) {
    uiStore.setAIProcessing(false);
    persistAIProcessingState();
    toast.warning('请先处理当前待确认的行动判定');
    return;
  }

  // 检查角色死亡状态
  const saveData = gameStateStore.toSaveData();
  if (saveData) {
    // 检查气血
    if ((saveData as any).角色?.属性?.气血?.当前 !== undefined && (saveData as any).角色.属性.气血.当前 <= 0) {
      uiStore.setAIProcessing(false);
      persistAIProcessingState();
      toast.error('角色已死亡，气血耗尽。无法继续游戏，请重新开始或复活角色。');
      return;
    }
    // 检查寿命（通过出生日期计算当前年龄，与寿元上限比较）
    const birthDate = (saveData as any).角色?.身份?.出生日期;
    const gameTime = (saveData as any).元数据?.时间;
    const lifespanLimit = (saveData as any).角色?.属性?.寿元上限;
    if (birthDate && gameTime && typeof lifespanLimit === 'number') {
      const currentAge = calculateAgeFromBirthdate(birthDate, gameTime);
      if (currentAge >= lifespanLimit) {
        uiStore.setAIProcessing(false);
        persistAIProcessingState();
        toast.error('角色已死亡，寿元耗尽。无法继续游戏，请重新开始或复活角色。');
        return;
      }
    }
  }

  const preflightOpenWorldAction = selectedScenarioEngineAction.value?.source === 'open_world_engine'
    ? selectedScenarioEngineAction.value
    : (saveData ? resolveWuyuanOpenWorldSelectionFromText(saveData, inputText.value.trim()) : undefined);
  const buttonSelected = Boolean(
    selectedScenarioEngineAction.value
    && (
      ('playerLine' in selectedScenarioEngineAction.value && selectedScenarioEngineAction.value.playerLine === inputText.value.trim())
      || selectedScenarioEngineAction.value.actionText === inputText.value.trim()
    ),
  );
  let routedIntentAction: ScenarioEngineActionSelection | undefined;
  let skipKeywordPreflightFromIntent = buttonSelected;
  let intentHeldProcessing = false;
  if (saveData && !buttonSelected) {
    const intentReset = aiResetToken;
    const inputSnapshot = inputText.value.trim();
    const activeSnapshot = characterStore.rootState.当前激活存档
      ? { 角色ID: characterStore.rootState.当前激活存档.角色ID, 存档槽位: characterStore.rootState.当前激活存档.存档槽位 }
      : null;
    const saveFingerprint = intentSaveFingerprint(saveData);
    uiStore.setAIProcessing(true);
    persistAIProcessingState();
    let continueAfterIntent = false;
    try {
      const intent = await resolveNaturalIntent({
        saveData,
        playerText: inputSnapshot,
        selected: selectedScenarioEngineAction.value,
        resolveFromText: resolveStoryEventActionFromPlayerText,
        signal: undefined,
        // 行动解释模块：预算/超时/推理档位由模块卡决定，模型按「回合模块模型」分配，未单独配置继承主流程。
        generate: async ({ systemPrompt, userPrompt, signal, requestId }) => {
          const { runGameModelModule } = await import('@/services/gameModelModules');
          const { raw } = await runGameModelModule('intent', {
            system: systemPrompt, input: userPrompt, generationId: requestId, signal,
          });
          return raw;
        },
      });
      if (!uiStore.isAIProcessing || aiResetToken !== intentReset) return;
      if (inputText.value.trim() !== inputSnapshot) {
        toast.info(NATURAL_INTENT_CLARIFY_DEFAULT);
        return;
      }
      const activeNow = characterStore.rootState.当前激活存档;
      if (!activeSnapshot || !activeNow
        || activeNow.角色ID !== activeSnapshot.角色ID
        || activeNow.存档槽位 !== activeSnapshot.存档槽位) {
        toast.info(NATURAL_INTENT_CLARIFY_DEFAULT);
        return;
      }
      const latestSave = gameStateStore.toSaveData();
      if (!latestSave || intentSaveFingerprint(latestSave) !== saveFingerprint) {
        toast.info(NATURAL_INTENT_CLARIFY_DEFAULT);
        return;
      }
      skipKeywordPreflightFromIntent = intent.skipKeywordPreflight;
      if (intent.notice) toast.info(intent.notice);
      if (intent.kind === 'unclear' || intent.kind === 'failed') {
        if (intent.hold) intentHoldMessage.value = intent.clarification || NATURAL_INTENT_CLARIFY_DEFAULT;
        toast.info(intent.clarification || NATURAL_INTENT_CLARIFY_DEFAULT);
        return;
      }
      if (intent.selection) {
        const fresh = intent.kind === 'matched'
          ? verifyFreshSelection(latestSave, {
            actionId: intent.selection.actionId || ('identityId' in intent.selection ? intent.selection.identityId : ''),
            source: intent.selection.source,
            eventId: 'eventId' in intent.selection ? String(intent.selection.eventId || '') : undefined,
            contractHash: 'contractHash' in intent.selection
              ? String(intent.selection.contractHash || '')
              : ('receiptId' in intent.selection ? String(intent.selection.receiptId || '') : undefined),
          })
          : intent.selection;
        if (intent.kind === 'matched' && !fresh) {
          toast.info(NATURAL_INTENT_CLARIFY_DEFAULT);
          return;
        }
        routedIntentAction = (fresh || intent.selection) as ScenarioEngineActionSelection;
      }
      continueAfterIntent = true;
      intentHeldProcessing = true;
    } finally {
      if (!continueAfterIntent && aiResetToken === intentReset) {
        uiStore.setAIProcessing(false);
        persistAIProcessingState();
        await nextTick();
        inputRef.value?.focus();
      }
    }
  }
  // 重要桥段推进卡片：输入框里的话被识别为要推进卡片动作时，只高亮卡片提示确认，不推进。
  // 判定确认后的二次执行沿用当初点卡片的确认。
  const keyBeatAttempt = [routedIntentAction, buttonSelected ? selectedScenarioEngineAction.value : undefined]
    .find(action => isKeyBeatCardAction(action as { source?: string; eventId?: string; actionId?: string } | undefined));
  if (!isFollowUpExecution && keyBeatAttempt && !(confirmedByCard && keyBeatAttempt === selectedScenarioEngineAction.value)) {
    keyBeatHighlight.value = true;
    intentHoldMessage.value = KEY_BEAT_CONFIRM_NOTICE;
    uiStore.setAIProcessing(false);
    persistAIProcessingState();
    return;
  }
  const preflightGambleRefusalAction = selectedScenarioEngineAction.value?.source === BAIHU_GAMBLE_REFUSAL_SOURCE
    ? selectedScenarioEngineAction.value
    : routedIntentAction?.source === BAIHU_GAMBLE_REFUSAL_SOURCE
      ? routedIntentAction
    : (saveData ? resolveBaihuGambleRefusalFromText(saveData, inputText.value.trim()) : undefined);
  const selectedEventJudgementAction = selectedScenarioEngineAction.value?.source === 'event_engine'
    && 'judgement' in selectedScenarioEngineAction.value
    && selectedScenarioEngineAction.value.judgement
    && selectedScenarioEngineAction.value.playerLine === inputText.value.trim()
    ? selectedScenarioEngineAction.value
    : undefined;
  let contractedJudgementResolution = execution?.resolution;
  if (saveData && selectedEventJudgementAction && !contractedJudgementResolution) {
    const prepared = prepareEventActionJudgement(
      saveData,
      selectedEventJudgementAction,
      getNarrativeTurn(saveData),
    );
    if (prepared.kind === 'issued' || prepared.kind === 'pending') {
      await persistJudgementSave(saveData);
      uiStore.setAIProcessing(false);
      persistAIProcessingState();
      toast.info('此行动存在风险，请先确认判定');
      return;
    }
    if (prepared.kind === 'resolved') contractedJudgementResolution = prepared.resolution;
  }
  if (!shouldSkipJudgementPreflight({
    skipPreflight: execution?.skipPreflight || Boolean(contractedJudgementResolution) || skipKeywordPreflightFromIntent,
    selectedSource: selectedScenarioEngineAction.value?.source || routedIntentAction?.source,
    selectedPlayerLine: selectedScenarioEngineAction.value && 'playerLine' in selectedScenarioEngineAction.value
      ? selectedScenarioEngineAction.value.playerLine
      : undefined,
    userMessage: inputText.value.trim(),
  }) && !preflightOpenWorldAction && !preflightGambleRefusalAction) {
    const proposal = buildLocalJudgementPreflight(judgementAction, saveData, getNarrativeTurn(saveData));
    if (proposal) {
      persistPendingJudgement(saveData, proposal);
      await persistJudgementSave(saveData);
      uiStore.setAIProcessing(false);
      persistAIProcessingState();
      toast.info('此行动存在风险，请先确认判定');
      return;
    }
  }

  // 🔥 在发送消息前备份到"上次对话"（用于回滚）
  if (gameStateStore.conversationAutoSaveEnabled) {
    try {
      await characterStore.saveToSlot('上次对话');
      console.log('[上次对话] 已在发送消息前备份当前状态');
    } catch (backupError) {
      console.warn('[上次对话] 备份失败（非致命）:', backupError);
      // 备份失败不阻止发送消息
    }
  }

	  const userMessage = inputText.value.trim();
	  console.log('[前端] 用户输入 inputText.value:', inputText.value);
	  console.log('[前端] 处理后 userMessage:', userMessage);

	  // 🔍 仅用于UI展示：记录本回合“实际发送给AI”的用户输入（不写入存档/记忆）
	  uiStore.lastSentUserIntentText = userMessage;
	  if (lastSelectedActionOption.value && userMessage === lastSelectedActionOption.value) {
	    uiStore.lastSentUserIntentSource = 'action_option';
	  } else if (lastSelectedActionOption.value && userMessage.includes(lastSelectedActionOption.value)) {
	    uiStore.lastSentUserIntentSource = 'mixed';
	  } else if (userMessage) {
	    uiStore.lastSentUserIntentSource = 'manual';
	  } else {
	    uiStore.lastSentUserIntentSource = 'unknown';
	  }

  const scenarioSaveAtSend = gameStateStore.toSaveData();
  const exactSelectedEventAction = selectedScenarioEngineAction.value?.source !== 'opportunity_engine'
    && selectedScenarioEngineAction.value?.source !== 'open_world_engine'
    && selectedScenarioEngineAction.value?.source !== BAIHU_GAMBLE_REFUSAL_SOURCE
    && selectedScenarioEngineAction.value?.playerLine === userMessage
    ? selectedScenarioEngineAction.value
    : undefined;
  const exactSelectedGambleRefusalAction = selectedScenarioEngineAction.value?.source === BAIHU_GAMBLE_REFUSAL_SOURCE
    && selectedScenarioEngineAction.value.actionText === userMessage
    ? selectedScenarioEngineAction.value
    : undefined;
  const resolvedGambleRefusalAction = exactSelectedEventAction
    ? undefined
    : exactSelectedGambleRefusalAction
      || (routedIntentAction?.source === BAIHU_GAMBLE_REFUSAL_SOURCE ? routedIntentAction : undefined)
      || (scenarioSaveAtSend ? resolveBaihuGambleRefusalFromText(scenarioSaveAtSend, userMessage) : undefined);
  const resolvedEventAction = resolvedGambleRefusalAction
    ? undefined
    : exactSelectedEventAction
      || (routedIntentAction && routedIntentAction.source === 'event_engine'
        ? routedIntentAction
        : undefined)
      || (scenarioSaveAtSend ? resolveStoryEventActionFromPlayerText(scenarioSaveAtSend, userMessage) : undefined);
  const exactSelectedOpportunityAction = selectedScenarioEngineAction.value?.source === 'opportunity_engine'
    && selectedScenarioEngineAction.value.actionText === userMessage
    ? selectedScenarioEngineAction.value
    : undefined;
  const resolvedOpportunityAction = exactSelectedEventAction || resolvedGambleRefusalAction
    ? undefined
    : exactSelectedOpportunityAction
      || (routedIntentAction?.source === 'opportunity_engine' ? routedIntentAction : undefined);
  const exactSelectedOpenWorldAction = selectedScenarioEngineAction.value?.source === 'open_world_engine'
    && selectedScenarioEngineAction.value.actionText === userMessage
    ? selectedScenarioEngineAction.value
    : undefined;
  const resolvedOpenWorldAction = exactSelectedEventAction || resolvedGambleRefusalAction || resolvedOpportunityAction
    ? undefined
    : exactSelectedOpenWorldAction
      || (routedIntentAction?.source === 'open_world_engine' ? routedIntentAction : undefined)
      || (scenarioSaveAtSend ? resolveWuyuanOpenWorldSelectionFromText(scenarioSaveAtSend, userMessage) : undefined);

  // 获取动作队列中的文本
  console.log('[前端] 动作队列 actionQueueText:', actionQueueText);

  let finalUserMessage = '';
  if (userMessage) {
    const combinedAction = actionQueueText ? `${userMessage}\n\n${actionQueueText}` : userMessage;
    finalUserMessage = `<行动趋向>${combinedAction}</行动趋向>
`;
  } else {
    finalUserMessage = actionQueueText ? `<行动趋向>${actionQueueText}</行动趋向>
` : '';
  }
  if (resolvedEventAction) {
    const result = resolvedEventAction;
    finalUserMessage += `\n【本地事件判定已预结算】事件=${result.eventId}；动作=${result.actionId}；结果=${result.expectedOutcome}；既定反馈=${result.outcomeText}。只演出该既定结果，不得另行判定、升级结果或写入事件完成标记。\n`;
  }
  if (resolvedOpenWorldAction) {
    finalUserMessage += `\n【本地开放世界行动已预结算】类型=${resolvedOpenWorldAction.kind}；既定事实=${resolvedOpenWorldAction.settledFacts.join('；')}。只演出这些既定事实，不得另行移动玩家、改写路线、免除代价或写入开放世界账本。\n`;
  }
  if (resolvedGambleRefusalAction) {
    finalUserMessage += `\n【本地白湖拒赌冲突已预结算】动作=${resolvedGambleRefusalAction.actionId}；既定事实=${resolvedGambleRefusalAction.settledFacts.join('；')}。只演出这些既定事实。不得写成已经赌输、自愿签卖身契、已经逃脱，也不得改写尚未发生的南荒之约。\n`;
  }
  if (contractedJudgementResolution) {
    const result = contractedJudgementResolution;
    const localDamageApplied = result.kind === 'combat' && result.appliedEffects.some(effect => effect.key === '角色.属性.气血.当前');
    const effectSummary = result.appliedEffects.map(describeJudgementEffect).join('；') || '无';
    finalUserMessage += `\n【本地判定已结算】判定ID=${result.id}；类型=${result.kind}；骰点=${result.roll}；总值=${result.total}；难度=${result.difficulty.value}；结果=${result.outcome}；正典策略=${result.canonPolicy}；已写入=${effectSummary}${localDamageApplied ? '；本地战斗伤害已结算=true' : ''}。只叙述该既定结果和已写入状态，不得另行掷骰、改写数字、杜撰额外状态效果或写入系统.扩展.判定；若策略为 route_process_only，不得直接完成、void 或改写活动正典事件。\n`;
  }
  console.log('[前端] 最终发送 finalUserMessage:', finalUserMessage);

  // 清空动作队列（动作已经添加到消息中）
  if (actionQueueText) {
    actionQueue.clearActions();
  }

  // 重置输入框高度
  nextTick(() => {
    adjustTextareaHeight();
  });

  // 用户消息只作为行动趋向提示词，不添加到记忆中
  const resetSnapshot = aiResetToken;
  // 前台开始：后台审计让路；回合记忆不取消，迟到结果排队到下一次提交后落账。
  yieldBackgroundAudit();
  const qingyuTurnId = beginQingyuTurnLongRequests(scenarioSaveAtSend);
  ownedQingyuTurnId = qingyuTurnId;
  uiStore.setAIProcessing(true);
  persistAIProcessingState();

  // 🔥 重置流式内容，准备接收新的流式输出
  uiStore.setStreamingContent('');
  rawStreamingContent.value = ''; // 清除原始流式内容
  streamingMessageIndex.value = 1; // 设置一个虚拟索引以启用流式处理

  // 使用优化的AI请求系统进行双向交互
  let aiResponse: GM_Response | null = null;
  let hasError = false;

  try {
    // 获取当前角色
    const character = characterStore.activeCharacterProfile;

    if (!character) {
      throw new Error('角色数据缺失');
    }

    try {
      const options: Record<string, unknown> = {
        onProgressUpdate: (progress: string) => {
          console.log('[AI进度]', progress);
        },
        playerIntentText: userMessage,
        useStreaming: useStreaming.value,
        shouldAbort: () => !uiStore.isAIProcessing || aiResetToken !== resetSnapshot,
      };
      if (resolvedOpportunityAction) options.opportunityAction = { ...resolvedOpportunityAction };
      else if (resolvedEventAction) {
        options.eventAction = { ...resolvedEventAction };
        options.eventActionProvenance = exactSelectedEventAction ? 'selected' : 'resolved_text';
      }
      if (resolvedOpenWorldAction) options.openWorldAction = { ...resolvedOpenWorldAction };
      if (resolvedGambleRefusalAction) options.gambleRefusalAction = { ...resolvedGambleRefusalAction };
      if (contractedJudgementResolution) options.judgementResolution = structuredClone(contractedJudgementResolution);

      // 酒馆环境：流式通过事件系统处理（STREAM_TOKEN_RECEIVED_INCREMENTALLY）
      // 非酒馆环境（网页版自定义API）：需要设置 onStreamChunk 才能实时渲染
      if (!isTavernEnvFlag) {
        console.log('[网页版流式] 设置 onStreamChunk 回调');
        resetStreamParseState(); // 重置解析状态
        (options as any).onStreamChunk = (chunk: string) => {
          if (!useStreaming.value || !chunk) return;
          if (aiResetToken !== resetSnapshot || !uiStore.isAIProcessing) return;
          console.log('[网页版流式] 收到chunk:', chunk.length, '字符');
          handleStreamChunk(chunk);
        };
      }

      // 生成唯一的 generation_id
      const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      uiStore.setCurrentGenerationId(generationId);
      options.generation_id = generationId;

      // 添加图片上传支持
      if (selectedImages.value.length > 0) {
        options.image = selectedImages.value;
        console.log('[图片上传] 将发送', selectedImages.value.length, '张图片');
      }

      (options as { qingyuTurnId?: string }).qingyuTurnId = qingyuTurnId;
      aiResponse = await bidirectionalSystem.processPlayerAction(
        finalUserMessage,
        character,
        options
      );

      if (!uiStore.isAIProcessing || aiResetToken !== resetSnapshot) {
        console.log('[AI响应处理] 已重置，忽略本次响应');
        aiResponse = null;
        return;
      }

      if (aiResponse?.transactionCommitted && aiResponse.narrativeNotice) toast.warning(aiResponse.narrativeNotice);

      // 验证AI响应结构
      if (isFastNarrativeHoldResponse(aiResponse)) {
        const save = gameStateStore.toSaveData();
        if (save) await persistJudgementSave(save);
        else refreshPendingJudgement();
        if (pendingJudgement.value) toast.info('此行动存在风险，请先确认判定');
        else {
          const notice = String((aiResponse as { fastNarrativeHoldNotice?: unknown }).fastNarrativeHoldNotice || '').trim();
          if (notice) toast.info(notice);
        }
        return;
      }
      if (aiResponse) {
        if (aiResponse.generationError) throw Object.assign(new Error(aiResponse.generationError.message), { code: aiResponse.generationError.code });
        if (aiResponse.outputTruncated) {
          toast.warning('回应被截断，已保留你的输入，可手动重试。');
          aiResponse = null;
          return;
        }
        const validation = validateProcessedAIResponse(aiResponse);
        if (!validation.isValid) {
          console.warn('[AI响应验证] 结构验证失败:', validation.errors);
          const saveForRetry = gameStateStore.toSaveData();
          if (
            aiResponse.transactionCommitted
            || remainingQingyuTurnLongRequests() === 0
            || (saveForRetry && usesFixedScenarioInventory(saveForRetry))
          ) {
            toast.warning('AI响应格式不正确，已保留你的输入，可手动重试。');
            aiResponse = null;
            return;
          }
          toast.warning('AI响应格式不正确，正在重试...');

          // 尝试重新生成
          const retryResponse = await retryAIResponse(
            finalUserMessage,
            character,
            validation.errors
          );

          if (!uiStore.isAIProcessing || aiResetToken !== resetSnapshot) {
            console.log('[AI响应处理] 已重置，停止重试结果处理');
            aiResponse = null;
            return;
          }

          if (retryResponse) {
            if (retryResponse.outputTruncated) {
              toast.warning('回应被截断，已保留你的输入，可手动重试。');
              aiResponse = null;
              return;
            }
            aiResponse = retryResponse;
            // 注意：重试成功后不显示额外的toast，统一在最后显示"天道已回"
            console.log('[AI响应验证] 重试成功');
          } else {
            // 所有重试都失败了，中止处理
            throw new Error('AI响应格式错误，且多次重试失败');
          }
        }
      }


      // 🔥 流式传输完成回调已经在 onStreamComplete 中处理
      // 这里不需要再次清除流式状态
      console.log('[流式输出] AI响应处理开始');
      // isAIProcessing 会在 finally 块中统一设置为 false

      // --- 核心逻辑：整合最终文本并更新状态 ---
      let finalText = '';
      const gmResp = aiResponse; // aiResponse 本身就是 GM_Response
      if (gmResp?.transactionCommitted) {
        inputText.value = ''; lastSelectedActionOption.value = null; selectedScenarioEngineAction.value = null;
      }

      console.log('[AI响应处理] 开始处理AI响应文本');
      console.log('[AI响应处理] aiResponse:', aiResponse);
      console.log('[AI响应处理] streamingContent:', streamingContent.value);

      // 优先从结构化响应中获取最准确的文本
      if (gmResp?.text && typeof gmResp.text === 'string') {
        finalText = gmResp.text;
        console.log('[AI响应处理] 使用 gmResponse.text 作为最终文本，长度:', finalText.length);
      } else if (streamingContent.value) {
        // 如果以上都没有，使用流式输出的最终结果作为备用
        // 🔥 从 JSON 响应中提取 text 字段
        finalText = extractTextFromJsonResponse(streamingContent.value);
        console.log('[AI响应处理] 使用 streamingContent 提取后作为最终文本，长度:', finalText.length);
      } else {
        console.warn('[AI响应处理] 未找到任何有效的文本内容');
      }

      console.log('[AI响应处理] 最终文本内容预览:', finalText.substring(0, 100) + '...');

      // 🔥 [重要] 记忆处理已在 AIBidirectionalSystem.processGmResponse 中完成
      // 包括：短期记忆、隐式中期记忆、叙事历史的添加
      // 这里只需要更新UI显示状态
      if (finalText) {
        console.log('[AI响应处理] 文本处理完成，记忆已由 AIBidirectionalSystem 处理');
        latestMessageText.value = gmResp?.text || null;

        // 更新UI显示
        if (currentNarrative.value) {
          // currentNarrative 现在自动显示最新短期记忆
          console.log('[AI响应处理] 已更新UI显示');
        }
      } else {
        latestMessageText.value = null;
        console.error('[AI响应处理] 没有找到有效的文本内容');
      }

    // 处理游戏状态更新（仅在有有效AI响应时执行）
    if (aiResponse && aiResponse.stateChanges) {
      // 先清空上一次的日志（在收到新响应时清空，而不是发送消息时）
      uiStore.clearCurrentMessageStateChanges();
      console.log('[日志清空] 收到新响应，已清空上一条消息的状态变更日志');

      // 🔥 [新架构] AI指令已在 AIBidirectionalSystem.processGmResponse 中执行完毕
      // gameStateStore 已包含最新数据，无需再次调用 updateCharacterData

      // 确保 stateChanges 有 changes 数组
      const stateChanges: StateChangeLog = (
        aiResponse.stateChanges &&
        typeof aiResponse.stateChanges === 'object' &&
        'changes' in aiResponse.stateChanges
      )
        ? aiResponse.stateChanges as StateChangeLog
        : { changes: [] };
      console.log('[状态更新] AI指令已执行，状态变更数量:', stateChanges.changes.length);


      // 将新的状态变更保存到 uiStore 的内存中（会覆盖之前的）
      if (aiResponse.stateChanges) {
        uiStore.setCurrentMessageStateChanges(aiResponse.stateChanges);
        console.log('[日志面板] State changes received and stored in memory:', aiResponse.stateChanges);
      }


      // 检查角色死亡状态（在状态更新后）
      refreshPendingJudgement();
      const currentSaveData = gameStateStore.toSaveData();
      if (currentSaveData) {
        // 检查气血
        if (currentSaveData.属性?.气血?.当前 !== undefined && currentSaveData.属性.气血.当前 <= 0) {
          toast.error('角色已死亡，气血耗尽');
        }
        // 检查寿命（通过出生日期计算当前年龄，与寿元上限比较）
        const birthDate2 = (currentSaveData as any).角色?.身份?.出生日期;
        const gameTime2 = (currentSaveData as any).元数据?.时间;
        const lifespanLimit2 = currentSaveData.属性?.寿元上限;
        if (birthDate2 && gameTime2 && typeof lifespanLimit2 === 'number') {
          const currentAge2 = calculateAgeFromBirthdate(birthDate2, gameTime2);
          if (currentAge2 >= lifespanLimit2) {
            toast.error('角色已死亡，寿元耗尽');
          }
        }
      }
    } else if (aiResponse) {
      console.log('[日志面板] No state changes received in this response.');
    }

    } catch (aiError) {
      if (isCanceledError(aiError) || !uiStore.isAIProcessing || aiResetToken !== resetSnapshot) {
        console.log('[AI处理失败] 已取消，停止后续处理');
        aiResponse = null;
        return;
      }
      console.error('[AI处理失败]', aiError);
      hasError = true;

      // 显示错误提示
      const errorMsg = aiError instanceof Error ? aiError.message : '未知错误';
      toast.error(`AI处理失败: ${errorMsg}`);

      // 🔥 清理流式输出状态（失败时清除所有流式内容）
      uiStore.setAIProcessing(false);
      streamingMessageIndex.value = null;
      uiStore.setStreamingContent('');
      rawStreamingContent.value = '';
      uiStore.setCurrentGenerationId(null);
      persistAIProcessingState();

      // 重要：不设置任何响应对象，确保后续处理跳过
      aiResponse = null;
    }

    // 系统消息直接覆盖当前叙述
    if (aiResponse && aiResponse.system_messages && Array.isArray(aiResponse.system_messages) && aiResponse.system_messages.length > 0) {
      // currentNarrative 现在自动显示最新短期记忆
    }

    // 🔥 [关键修复] 无论成功失败，都在这里清除AI处理状态
    // 成功的提示
    if (!hasError && aiResponse) {
      toast.success('天机重现');
      // 清空已发送的图片
      clearImages();
      inputText.value = '';
      lastSelectedActionOption.value = null;
      selectedScenarioEngineAction.value = null;
      nextTick(() => {
        adjustTextareaHeight();
      });
    }

    // 🔥 统一清除AI处理状态（成功路径）
    if (!hasError) {
      console.log('[AI响应处理] 处理完成，清除AI处理状态');
      uiStore.setAIProcessing(false);
      streamingMessageIndex.value = null;
      uiStore.setCurrentGenerationId(null);
      // 🔥 关键修复：清除流式内容，防止下次显示旧内容
      uiStore.resetStreamingState();
      rawStreamingContent.value = '';
      persistAIProcessingState();
    }

  } catch (error: unknown) {
    if (isCanceledError(error) || !uiStore.isAIProcessing || aiResetToken !== resetSnapshot) {
      console.log('[AI交互] 已取消，停止处理');
      return;
    }
    console.error('[AI交互] 处理失败:', error);
    hasError = true;

    // 显示错误提示
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    toast.error(`请求失败: ${errorMessage}`);

    // 🔥 清理流式输出状态（失败时清除所有流式内容）
    uiStore.setAIProcessing(false);
    streamingMessageIndex.value = null;
    uiStore.setStreamingContent('');
    rawStreamingContent.value = '';
    uiStore.setCurrentGenerationId(null);
    persistAIProcessingState();
  } finally {
    if (aiResetToken === resetSnapshot) {
      releaseQingyuTurnLongRequests(qingyuTurnId);
      if (ownedQingyuTurnId === qingyuTurnId) ownedQingyuTurnId = null;
    } else {
      invalidateQingyuTurnLongRequests(qingyuTurnId);
    }
    // 🔥 兜底机制：确保状态一定被清除
    if (aiResetToken === resetSnapshot && isAIProcessing.value) {
      console.warn('[AI响应处理] finally块：状态未清除，强制清除（兜底）');
      uiStore.setAIProcessing(false);
      streamingMessageIndex.value = null;
      uiStore.resetStreamingState();
      rawStreamingContent.value = '';
      uiStore.setCurrentGenerationId(null);
      persistAIProcessingState();
    }

    // 最终统一存档（仅成功时）
    if (aiResetToken === resetSnapshot && aiResponse) {
      try {
        console.log('[AI响应处理] 最终统一存档...');
        await characterStore.saveCurrentGame();
        const slot = characterStore.activeSaveSlot;
        if (slot) {
          toast.success(`存档【${slot.存档名}】已保存`);
        }
        console.log('[AI响应处理] 最终统一存档完成');
        if (aiResponse.transactionCommitted) {
          startModuleBackground();
          scheduleBackgroundAudit();
        }
      } catch (storageError) {
        console.error('[AI响应处理] 最终统一存档失败:', storageError);
        toast.error('游戏存档失败，请尝试手动保存');
      }
    }
    if (aiResetToken === resetSnapshot) {
      await nextTick();
      inputRef.value?.focus();
    }
  }
};

const executePendingJudgement = async (testOutcome?: JudgementOutcome) => {
  if (!pendingJudgement.value || isAIProcessing.value) return;
  const save = gameStateStore.toSaveData();
  if (!save) return;
  const resolution = resolvePendingJudgement(save, pendingJudgement.value.id, {
    currentTurn: getNarrativeTurn(save),
    ...(testOutcome ? { testOutcome } : {}),
  });
  settleFastNarrativeDemoAdjudication(save, resolution);
  const worldSimulationResult = settleWorldSimulationJudgement(save, resolution);
  await persistJudgementSave(save);
  if (worldSimulationResult.pending) {
    toast.info('本地判定已达到改写枢纽的门槛；请在右栏确认是否进入正式 IF 世界线');
    return;
  }
  if (worldSimulationResult.expired) {
    toast.warning('局势已先行结算，这次旧判定不能再改写世界结果');
  }
  await sendMessage({ skipPreflight: true, resolution });
};

const changePendingJudgement = async () => {
  if (!pendingJudgement.value) return;
  const save = gameStateStore.toSaveData();
  if (!save) return;
  const actionText = pendingJudgement.value.actionText;
  cancelStoredJudgement(save, pendingJudgement.value.id, getNarrativeTurn(save));
  await persistJudgementSave(save);
  inputText.value = actionText;
  inputRef.value?.focus();
};

const cancelPendingJudgement = async () => {
  if (!pendingJudgement.value) return;
  const save = gameStateStore.toSaveData();
  if (!save) return;
  cancelStoredJudgement(save, pendingJudgement.value.id, getNarrativeTurn(save));
  await persistJudgementSave(save);
  toast.success('已撤回行动判定');
};

// （移除逐条总结逻辑）不再对溢出的短期记忆逐条生成总结

// 键盘事件处理
// 格式化当前时间（用于显示当前北京时间 - 现实世界时间）
const formatCurrentTime = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');

  // 返回格式：2025-01-15 14:30:25（现实世界北京时间）
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
};

// 自动调整输入框高度
const adjustTextareaHeight = () => {
  const textarea = inputRef.value;
  if (textarea) {
    // 单行基准高度（根据line-height计算）
    const lineHeight = 1.4; // 与CSS中的line-height一致
    const fontSize = 0.9; // rem
    const padding = 16; // 8px * 2
    const singleLineHeight = fontSize * 16 * lineHeight + padding; // 约36px

    // 计算所需高度
    textarea.style.height = `${singleLineHeight}px`; // 先设置为单行高度
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 120; // 与CSS中的max-height保持一致

    // 只有当内容超过单行时才增加高度
    if (scrollHeight > singleLineHeight) {
      const newHeight = Math.min(scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
    }

    // 如果内容超出最大高度，启用滚动
    if (scrollHeight > maxHeight) {
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.overflowY = 'hidden';
    }
  }
};

// 监听输入变化以调整高度
const handleInput = () => {
  intentHoldMessage.value = '';
  keyBeatHighlight.value = false;
  nextTick(() => {
    adjustTextareaHeight();
  });
};

// 初始化/重新初始化面板以适应当前存档
const initializePanelForSave = async () => {
  console.log('[主面板] 为当前存档初始化面板 (新逻辑)...');
  try {
    if (hasActiveCharacter.value) {
      // 🔥 使用 gameStateStore 获取数据
      const memories = gameStateStore.memory?.短期记忆;

      console.log('[主面板-调试] 存档数据检查:', {
        有游戏数据: gameStateStore.isGameLoaded,
        有叙事历史: !!gameStateStore.narrativeHistory,
        叙事历史长度: gameStateStore.narrativeHistory?.length || 0,
        有短期记忆: !!memories,
        短期记忆长度: memories?.length || 0,
        当前显示内容: currentNarrative.value?.content?.substring(0, 50) + '...'
      });

      // 🔥 [核心修复] 优先从叙事历史加载最新内容并同步指令日志
      if (gameStateStore.narrativeHistory && gameStateStore.narrativeHistory.length > 0) {
        const latestNarrative = gameStateStore.narrativeHistory[gameStateStore.narrativeHistory.length - 1];

        // 🔥 [关键修复] 每次加载存档都要同步指令日志到最新叙事的stateChanges
        if (latestNarrative.stateChanges) {
          uiStore.setCurrentMessageStateChanges(latestNarrative.stateChanges);
          console.log('[主面板] ✅ 已同步指令日志到最新叙事', {
            变更数量: latestNarrative.stateChanges.changes?.length || 0
          });
        }

        // 如果短期记忆为空，从叙事历史同步内容
        if (!memories || memories.length === 0) {
          if (latestNarrative.content) {
            gameStateStore.addToShortTermMemory(latestNarrative.content);
            console.log('[主面板] ✅ 已从叙事历史同步内容到短期记忆');
          }
        }
      } else if (memories && memories.length > 0) {
        // 回退：从短期记忆加载（旧版本存档，没有叙事历史）
        console.log('[主面板] ⚠️ 从短期记忆加载（无叙事历史）');
        // currentNarrative 现在自动显示最新短期记忆
      } else {
        // 未找到记忆或叙事历史，显示欢迎信息
        console.log('[主面板] 未找到叙事记录，显示欢迎信息');
        // currentNarrative 现在自动显示最新短期记忆
      }
      await syncGameState();
    } else {
      // 没有激活的角色
      // currentNarrative 现在自动显示最新短期记忆
    }
    nextTick(() => {
      if (contentAreaRef.value) {
        contentAreaRef.value.scrollTop = contentAreaRef.value.scrollHeight;
      }
    });
  } catch (error) {
    console.error('[主面板] 初始化存档数据失败:', error);
    // currentNarrative 现在自动显示最新短期记忆
  }
};

// 重置面板状态以进行存档切换
const resetPanelState = () => {
  console.log('[主面板] 检测到存档切换，正在重置面板状态...');
  abandonOwnedGameTurn();
  actionQueue.clearActions();
  // currentNarrative 现在自动显示最新短期记忆
  inputText.value = '';
  latestMessageText.value = null;
};

// 监听激活存档ID的变化
watch(() => characterStore.rootState.当前激活存档, async (newSlotId, oldSlotId) => {
  // 仅在实际发生切换时执行，忽略组件首次加载（oldSlotId为undefined）
  if (newSlotId && newSlotId !== oldSlotId) {
    console.log(`[主面板] 存档已切换: 从 ${oldSlotId || '无'} 到 ${newSlotId}`);
    resetPanelState();
    await initializePanelForSave();
    refreshPendingJudgement();
  }
});

// 组件挂载时执行一次性初始化
onMounted(async () => {
  try {
    // 一次性设置
    loadMemorySettings();
    restoreAIProcessingState();
    await initializeSystemConnections();
    nextTick(adjustTextareaHeight);

    // 为初始加载的存档初始化面板
    await initializePanelForSave();
    refreshPendingJudgement();

    // 监听来自MemoryCenterPanel的配置更新事件
    panelBus.on('memory-settings-updated', (settings: unknown) => {
      console.log('[记忆设置] 接收到配置更新事件:', settings);
      if (settings && typeof settings === 'object') {
        const settingsObj = settings as Record<string, unknown>;
        if (typeof settingsObj.shortTermLimit === 'number') {
          maxShortTermMemories.value = settingsObj.shortTermLimit;
          console.log(`[记忆设置] 短期记忆上限已更新为: ${maxShortTermMemories.value}`);
        }
        if (typeof settingsObj.midTermTrigger === 'number') {
          maxMidTermMemories.value = settingsObj.midTermTrigger;
          console.log(`[记忆设置] 中期记忆触发阈值已更新为: ${maxMidTermMemories.value}`);
        }
        if (typeof settingsObj.midTermKeep === 'number') {
          midTermKeepCount.value = settingsObj.midTermKeep;
          console.log(`[记忆设置] 中期记忆保留数量已更新为: ${midTermKeepCount.value}`);
        }
      }
    });

    // 监听来自其他面板的“填充/发送到对话”事件（替代复制提示词）
    chatBus.on('prefill', handleChatPrefill);
    chatBus.on('send', handleChatSend);

    // 🔥 监听酒馆助手的生成事件
    if (isTavernEnvFlag) {
      const helper = getTavernHelper();
      if (helper) {
        console.log('[主面板] 注册酒馆事件监听');

      // 🔥 使用全局 eventOn 函数监听流式事件
      const eventOn = (window as unknown as Record<string, unknown>).eventOn;
      const iframe_events = (window as unknown as Record<string, unknown>).TavernHelper as Record<string, unknown>;

      // 🔥 防止重复注册：只在第一次挂载时注册事件监听器（使用全局标志）
      const listenersRegistered = Boolean(globalWindowState[GLOBAL_EVENT_KEY]);
      if (eventOn && iframe_events && typeof eventOn === 'function' && !listenersRegistered) {
        const events = (iframe_events as unknown as { iframe_events: Record<string, string> }).iframe_events;

        // 🔥 创建事件处理函数并保存到全局
        const globalHandlers = globalWindowState[GLOBAL_HANDLERS_KEY] as Record<string, unknown>;

        // 🔥 辅助函数：检查 generationId 是否匹配（支持分步生成的 _step1/_step2 后缀）
        const isMatchingGenerationId = (eventId: string): boolean => {
          const currentId = currentGenerationId.value;
          if (!currentId || !eventId) return false;
          // 精确匹配 或 分步生成后缀匹配（eventId 以 currentId 开头，后面是 _step）
          return eventId === currentId || eventId.startsWith(currentId + '_step');
        };

        globalHandlers.onGenerationStarted = (generationId: string) => {
          if (isMatchingGenerationId(generationId)) {
            const currentId = currentGenerationId.value;
            const isStep2 = currentId ? generationId.startsWith(`${currentId}_step2`) : false;
            if (isStep2) return;
            uiStore.setStreamingContent('');
            rawStreamingContent.value = '';
            console.log('[流式输出] GENERATION_STARTED - 已重置状态');
          }
        };

        globalHandlers.onStreamToken = (chunk: string, generationId: string) => {
          if (isMatchingGenerationId(generationId) && useStreaming.value && chunk) {
            const currentId = currentGenerationId.value;
            const isStep2 = currentId ? generationId.startsWith(`${currentId}_step2`) : false;
            if (isStep2) return;
            // 增量追加到原始内容
            rawStreamingContent.value += chunk;
            uiStore.setStreamingContent(extractStreamingNarrativeText(rawStreamingContent.value));
          }
        };

        globalHandlers.onGenerationEnded = (generationId: string) => {
          if (isMatchingGenerationId(generationId)) {
            console.log('[流式输出] GENERATION_ENDED 事件触发，清除AI处理状态');
            // 不在这里立即清除，让 sendMessage 的成功路径处理
            // 这里只是确保事件被触发的日志
          }
        };

        // 🔥 注册事件监听器
        eventOn(events.GENERATION_STARTED, globalHandlers.onGenerationStarted);
        eventOn(events.STREAM_TOKEN_RECEIVED_INCREMENTALLY, globalHandlers.onStreamToken);
        eventOn(events.GENERATION_ENDED, globalHandlers.onGenerationEnded);

        globalWindowState[GLOBAL_EVENT_KEY] = true;
        console.log('[主面板] ✅ 流式事件监听器已注册（全局唯一）');
      } else if (listenersRegistered) {
        console.log('[主面板] ⏭️ 跳过事件监听器注册（全局已注册）');
      }

        console.log('[主面板] ✅ 事件监听器注册完成');
      } else {
        console.warn('[主面板] ⚠️ 酒馆助手不可用，事件监听未注册');
      }
    }

  } catch (error) {
    console.error('[主面板] 首次挂载失败:', error);
    // currentNarrative 现在自动显示最新短期记忆
  }
});

// 组件激活时恢复AI处理状态（适用于keep-alive或面板切换）
onActivated(() => {
  console.log('[主面板] 组件激活，恢复AI处理状态');
  restoreAIProcessingState();
});

// 🔥 组件卸载时先放弃本组件回合，再清监听。非酒馆也必须取消在途请求。
onUnmounted(() => {
  console.log('[主面板] 组件卸载，放弃本组件回合并清理事件监听器');
  abandonOwnedGameTurn();

  chatBus.off('prefill', handleChatPrefill);
  chatBus.off('send', handleChatSend);

  if (!isTavernEnvFlag) {
    return;
  }

  // 尝试移除事件监听器
  try {
    const eventOff = (window as unknown as Record<string, unknown>).eventOff;
    const iframe_events = (window as unknown as Record<string, unknown>).TavernHelper as Record<string, unknown>;

    const listenersRegistered = Boolean(globalWindowState[GLOBAL_EVENT_KEY]);
    if (eventOff && iframe_events && typeof eventOff === 'function' && listenersRegistered) {
      const events = (iframe_events as unknown as { iframe_events: Record<string, string> }).iframe_events;
      const globalHandlers = globalWindowState[GLOBAL_HANDLERS_KEY] as Record<string, unknown>;

      if (globalHandlers.onGenerationStarted) {
        eventOff(events.GENERATION_STARTED, globalHandlers.onGenerationStarted);
      }
      if (globalHandlers.onStreamToken) {
        eventOff(events.STREAM_TOKEN_RECEIVED_INCREMENTALLY, globalHandlers.onStreamToken);
      }
      if (globalHandlers.onGenerationEnded) {
        eventOff(events.GENERATION_ENDED, globalHandlers.onGenerationEnded);
      }

      globalWindowState[GLOBAL_EVENT_KEY] = false;
      globalWindowState[GLOBAL_HANDLERS_KEY] = {};
      console.log('[主面板] ✅ 事件监听器已清理（全局）');
    }
  } catch (error) {
    console.warn('[主面板] ⚠️ 清理事件监听器失败:', error);
  }
});

// 🔥 监听用户滚动，检测是否手动向上滚动
const handleContentScroll = () => {
  if (!contentAreaRef.value) return;
  const el = contentAreaRef.value;
  // 如果距离底部超过 100px，认为用户手动向上滚动了
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  userHasScrolledUp.value = distanceFromBottom > 100;
};

// 🔥 监听流式内容变化，自动滚动到底部（可被用户打断）
watch(streamingContent, () => {
  // 如果用户手动向上滚动了，不自动跟随
  if (userHasScrolledUp.value) return;

  if (streamingContent.value && contentAreaRef.value) {
    nextTick(() => {
      contentAreaRef.value!.scrollTop = contentAreaRef.value!.scrollHeight;
    });
  }
});

// 🔥 当新的流式传输开始时，重置滚动状态
watch(isAIProcessing, (newVal, oldVal) => {
  if (newVal && !oldVal) {
    // 新的AI处理开始，重置用户滚动状态
    userHasScrolledUp.value = false;
  }
});

// 🔥 [核心修复] 监听叙事历史变化，自动更新 currentNarrative 为最新一条
watch(() => gameStateStore.narrativeHistory, (newHistory) => {
  if (newHistory && newHistory.length > 0) {
    const latestNarrative = newHistory[newHistory.length - 1];
    // currentNarrative 现在自动显示最新短期记忆

    // 同步更新 uiStore 中的状态变更，确保命令日志可用
    if (latestNarrative.stateChanges) {
      uiStore.setCurrentMessageStateChanges(latestNarrative.stateChanges);
      console.log('[主面板] ✅ 已更新指令日志', {
        变更数量: latestNarrative.stateChanges.changes?.length || 0,
        前3条: latestNarrative.stateChanges.changes?.slice(0, 3).map(c => c.key) || []
      });
    } else {
      console.warn('[主面板] ⚠️ 最新叙事没有状态变更记录');
    }
  }
}, { deep: true });


// 初始化系统连接
const initializeSystemConnections = async () => {
  try {
    console.log('[主面板] 初始化系统连接...');

    console.log('[主面板] 系统连接初始化完成');
  } catch (error) {
    console.error('[主面板] 系统连接初始化失败:', error);
  }
};

// 同步游戏状态
const syncGameState = async () => {
  try {
    const character = characterStore.activeCharacterProfile;
    if (!character) return;

    console.log('[主面板] 游戏状态同步完成');
  } catch (error) {
    console.error('[主面板] 游戏状态同步失败:', error);
  }
};

</script>

<style scoped>
/* 快照回退样式 */
.rollback-group {
  position: relative;
  display: flex;
  gap: 4px;
}

.snapshot-btn {
  position: relative;
}

.snapshot-count {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #4c87ad;
  color: white;
  font-size: 11px;
  font-weight: 700;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.snapshot-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  min-width: 200px;
  max-height: 300px;
  overflow-y: auto;
  z-index: 100;
}

.snapshot-item {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--color-border);
}

.snapshot-item:hover {
  background: var(--color-surface-hover);
}

.snapshot-item:last-child {
  border-bottom: none;
}

.snapshot-label {
  font-size: 13px;
  color: var(--color-text);
}

.snapshot-time {
  font-size: 11px;
  color: var(--color-text-secondary);
}

/* 命令日志弹窗样式 */
.command-log-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  backdrop-filter: blur(4px);
}

.command-log-modal {
  background: var(--color-surface);
  border-radius: 16px;
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
}

/* 弹窗动画 */
.command-log-modal-enter-active,
.command-log-modal-leave-active {
  transition: all 0.3s ease;
}
.command-log-modal-enter-from,
.command-log-modal-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(20px);
}

.command-log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, var(--color-surface-light) 0%, var(--color-surface-hover) 100%);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.command-log-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
}

.close-log-btn {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-log-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
  transform: rotate(90deg);
}

.command-log-content {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

.command-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.command-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: var(--color-surface-light);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.command-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: var(--color-primary);
}

.command-icon-wrapper {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.command-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.command-description {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-text);
  line-height: 1.4;
}

.command-values {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-family: var(--font-family-mono);
}

.old-value, .new-value {
  padding: 4px 8px;
  border-radius: 4px;
}

.old-value {
  background: rgba(var(--color-error-rgb), 0.1);
  color: var(--color-danger);
  text-decoration: line-through;
}

.new-value {
  background: rgba(var(--color-success-rgb), 0.1);
  color: var(--color-success);
  font-weight: 600;
}

.arrow {
  color: var(--color-text-secondary);
  font-weight: 600;
}

.no-commands {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  color: var(--color-text-secondary);
}

.no-commands .empty-icon {
  opacity: 0.5;
  margin-bottom: 1rem;
}

.no-commands .empty-text {
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--color-text);
  font-size: 1rem;
}

.no-commands .empty-hint {
  font-size: 0.85rem;
  opacity: 0.8;
}

/* 深色主题适配 */
[data-theme="dark"] .command-log-modal {
  background: #1e2228;
  border-color: #56534b;
}
[data-theme="dark"] .command-log-header {
  background: linear-gradient(135deg, #3d3a35 0%, #1e2228 100%);
  border-color: #56534b;
}
[data-theme="dark"] .command-item {
  background: #3d3a35;
  border-color: #56534b;
}
[data-theme="dark"] .command-item:hover {
  border-color: var(--color-primary);
}
[data-theme="dark"] .command-icon-wrapper {
  background: rgba(var(--color-primary-rgb), 0.1);
}
[data-theme="dark"] .old-value {
  background: rgba(var(--color-error-rgb), 0.2);
}
[data-theme="dark"] .new-value {
  background: rgba(var(--color-success-rgb), 0.2);
}

.main-game-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  box-sizing: border-box;
}

/* 短期记忆区域 */
.memory-section {
  padding: 12px 20px;
  background: linear-gradient(135deg, #fefbff 0%, #f2eee4 100%);
  border-bottom: 1px solid #ddd7c9;
  position: relative;
  z-index: 20;
  flex-shrink: 0;
}

.memory-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: 4px 0;
  transition: all 0.2s ease;
}

.memory-header:hover {
  background: rgba(111, 127, 168, 0.05);
  border-radius: 6px;
  margin: -4px;
  padding: 8px 4px;
}

.memory-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #6f7fa8;
}

.memory-icon {
  color: #a09a8d;
  transition: transform 0.2s ease;
}

/* 下拉悬浮效果 */
.memory-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--color-surface);
  border: 1px solid #ddd7c9;
  border-top: none;
  border-radius: 0 0 12px 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  z-index: 19;
  max-height: 300px;
  overflow-y: auto;
}

.memory-content {
  padding: 16px 20px;
}

.memory-item {
  font-size: 0.85rem;
  color: #3c3934;
  margin-bottom: 12px;
  padding: 12px 16px;
  background: rgba(111, 127, 168, 0.05);
  border-radius: 8px;
  border-left: 3px solid #6f7fa8;
  line-height: 1.5;
}

.memory-item:last-child {
  margin-bottom: 0;
}

.no-memory {
  font-size: 0.9rem;
  color: #a29c90;
  font-style: italic;
  text-align: center;
  padding: 20px;
}

/* 下拉动画 */
.memory-dropdown-enter-active,
.memory-dropdown-leave-active {
  transition: all 0.3s ease;
}

.memory-dropdown-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.memory-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 思维链区域样式 */
.thinking-section {
  margin: 12px 16px;
  background: linear-gradient(135deg, #fef3c7 0%, #fef9c3 100%);
  border: 1px solid #dfc06f;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0; /* 防止被挤压 */
  min-width: 0; /* 允许内容收缩但不被完全挤压 */
}

.thinking-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.thinking-header:hover {
  background: rgba(213, 170, 74, 0.15);
}

.thinking-icon {
  color: #a97528;
  flex-shrink: 0;
}

.thinking-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #92400e;
  flex: 1;
}

.thinking-badge {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 10px;
}

.thinking-badge.streaming {
  color: #8c5f22;
  background: rgba(213, 170, 74, 0.3);
  animation: pulse 1.5s ease-in-out infinite;
}

.thinking-badge.completed {
  color: #3d5f43;
  background: rgba(95, 155, 106, 0.2);
  animation: none;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.expand-icon {
  color: #8c5f22;
  flex-shrink: 0;
}

.thinking-content {
  padding: 12px 14px;
  border-top: 1px solid rgba(213, 170, 74, 0.3);
  font-size: 0.85rem;
  color: #78350f;
  line-height: 1.6;
  max-height: 300px;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.5);
}

/* 思维链展开动画 */
.thinking-expand-enter-active,
.thinking-expand-leave-active {
  transition: all 0.3s ease;
}

.thinking-expand-enter-from,
.thinking-expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

/* 当前叙述显示区域 */
.current-narrative {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 0; /* 防止flex收缩问题 */
  border-radius: 12px; /* 圆角 */
  box-shadow: none !important; /* 移除阴影 */
  background-color: var(--color-surface) !important; /* 提亮叙事区域但不刺眼 */
  overflow-x: hidden; /* 防止水平滚动条 */
  overflow-y: auto; /* 允许垂直滚动 */
  padding-right: 12px; /* 给斜体字留出空间，防止被滚动条截断 */
}

/* 流式输出内容样式 */
.streaming-narrative-content {
  margin-top: 16px;
  padding: 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  animation: fadeIn 0.3s ease-in;
}

/* 用户本回合输入展示（仅UI；不进入记忆/存档） */
.last-user-intent {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  background: rgba(var(--color-primary-rgb), 0.05);
}

.last-user-intent-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  color: var(--color-text-secondary);
  font-size: 0.85rem;
}

.last-user-intent-header .k {
  font-weight: 700;
  color: var(--color-text);
}

.last-user-intent-header .badge {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  font-weight: 700;
}

.last-user-intent-text {
  white-space: pre-wrap;
  line-height: 1.55;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
  overflow-wrap: anywhere;
}

.streaming-text,
.narrative-text {
  line-height: 1.8;
  color: var(--color-text);
  font-size: var(--base-font-size, 1rem);
  /* 跟随主区宽度铺满：曾试过钉死 40em，宽屏下右侧会空出几百像素 */
  max-width: 100%;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.content-area {
  background-color: var(--color-surface) !important; /* 提亮内容区 */
  padding: 20px 8px 20px 20px; /* 右侧留小间距给滚动条 */
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  /* 显示可见的滚动拇指，轨道透明 */
  scrollbar-color: var(--color-border) transparent;
  box-sizing: border-box;
  min-height: 200px;
  display: flex; /* 让子元素可以撑满高度 */
  box-shadow: none !important; /* 移除阴影 */
}

/* 深色主题下 content-area 背景与内部一致 */
[data-theme="dark"] .content-area {
  background-color: #1e2228 !important;
}

/* WebKit滚动条样式 */
.content-area::-webkit-scrollbar {
  width: 6px;
  background: transparent;
}

.content-area::-webkit-scrollbar-track {
  background: transparent;
}

.content-area::-webkit-scrollbar-track-piece {
  background: transparent;
}

.content-area::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background-color: var(--color-border);
}

/* 悬停时略微增强可见度 */
.content-area:hover::-webkit-scrollbar-thumb {
  background-color: var(--color-text-secondary);
}

.content-area::-webkit-scrollbar-button {
  display: none;
}

.content-area::-webkit-scrollbar-corner {
  background: transparent;
}


/* AI处理状态指示器（生成时显示在顶部） */
.ai-processing-indicator {
  width: 100%;
  background: linear-gradient(135deg, rgba(111, 127, 168, 0.1) 0%, rgba(76, 135, 173, 0.05) 100%);
  border: 1px solid rgba(111, 127, 168, 0.2);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(111, 127, 168, 0.1);
  flex-shrink: 0; /* 防止被挤压 */
  box-sizing: border-box;
}

/* 重置状态按钮 */
.reset-state-btn {
  padding: 6px;
  font-size: 13px;
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: auto; /* 推到右侧 */
}

.reset-state-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-danger);
  border-color: var(--color-border-hover);
  transform: translateY(-1px);
}

/* 流式状态元数据布局 */
.streaming-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}

.streaming-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--color-primary);
  font-weight: 500;
}


.streaming-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-primary);
  animation: pulse 1.2s ease-in-out infinite;
}

.streaming-text {
  font-weight: 500;
}

/* 等待动画样式 */
.waiting-animation {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 0; /* 增加一些垂直空间 */
}

.thinking-dots {
  display: flex;
  gap: 8px;
}

.thinking-dots .dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-primary);
  animation: thinking 1.4s ease-in-out infinite;
}

.thinking-dots .dot:nth-child(1) {
  animation-delay: 0s;
}

.thinking-dots .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.thinking-dots .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes thinking {
  0%, 60%, 100% {
    transform: scale(1);
    opacity: 0.7;
  }
  30% {
    transform: scale(1.3);
    opacity: 1;
  }
}

/* .waiting-text is no longer used */

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 currentColor; opacity: 0.8; }
  70% { box-shadow: 0 0 0 6px transparent; opacity: 1; }
  100% { box-shadow: 0 0 0 0 transparent; opacity: 0.8; }
}

/* 输入框右侧的流式传输选项样式 - 删除旧样式 */

/* 输入框容器样式 */
.input-container {
  flex: 1;
  position: relative;
  display: flex;
  align-items: stretch; /* 让内部元素垂直拉伸 */
  border: 1px solid #c9c3b6;
  border-radius: 8px;
  background: var(--color-surface);
  transition: all 0.2s ease;
  min-height: 32px; /* 减小最小高度以对应单行 */
  max-width: 100%; /* 防止横向扩展 */
  overflow: hidden; /* 确保内容不会溢出容器 */
}

.input-container:focus-within {
  border-color: #4c87ad;
  box-shadow: 0 0 0 3px rgba(76, 135, 173, 0.1);
}

.input-container:has(.game-input:disabled) {
  background: #f9fafb;
}

/* 输入框内部的文本区域 */
.input-container /* 本局结束：只收界面，不复述结局——正文已经写过了。
   用朱砂系（--color-danger）压住，与普通提示区分；配色走既有变量，不写字面量。 */
.game-over-card {
  margin: 0 0 10px;
  padding: 12px 14px;
  border: 1px solid var(--color-danger);
  border-left-width: 3px;
  border-radius: 3px;
  background: var(--color-surface-light);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ending-image {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
.game-over-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.game-over-tag {
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  color: var(--color-danger);
  border: 1px solid var(--color-danger);
  border-radius: 2px;
  padding: 1px 6px;
}
.game-over-head h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-text);
}
.game-over-hint {
  margin: 0;
  font-size: 0.82rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
}
.game-over-acts {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.game-over-acts button {
  font-size: 0.82rem;
  padding: 6px 14px;
  border-radius: 2px;
  cursor: pointer;
  font-family: inherit;
}
.go-primary {
  background: var(--color-primary);
  color: var(--color-surface);
  border: 1px solid var(--color-primary);
}
.go-ghost {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}
.game-over-acts button:hover { opacity: 0.88; }

.game-input {
  flex: 1;
  border: none;
  background: transparent;
  padding: 8px 16px;
  padding-right: 0; /* 右侧留给流式传输选项 */
  outline: none;
  box-shadow: none;
  resize: none;
  overflow-y: auto;
  width: 100%; /* 确保宽度填满容器 */
  min-height: 24px; /* 单行高度 */
  max-height: 120px;
  min-width: 0; /* 允许缩小 */
  box-sizing: border-box;
  word-wrap: break-word;
  white-space: pre-wrap; /* 保持换行和空格 */
  overflow-wrap: break-word;
  /* 移除自动高度相关样式，用JS控制 */
  height: auto;
  line-height: 1.4;
  /* 透明滚动条（Firefox） */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.input-container .game-input:focus {
  border: none;
  box-shadow: none;
}

/* 透明滚动条（WebKit） */
.input-container .game-input::-webkit-scrollbar {
  width: 6px;
  background: transparent;
}

.input-container .game-input::-webkit-scrollbar-track,
.input-container .game-input::-webkit-scrollbar-track-piece,
.input-container .game-input::-webkit-scrollbar-corner {
  background: transparent;
}

.input-container .game-input::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background-color: transparent;
}

.input-container .game-input:hover::-webkit-scrollbar-thumb {
  background-color: transparent;
}

/* 输入框内部的流式传输选项 */
.stream-toggle-inside {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  white-space: nowrap;
  padding: 4px 12px;
  border-left: 1px solid #e2dccf;
  margin-left: 8px;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
  align-self: stretch; /* 垂直拉伸以匹配容器高度 */
  min-height: 32px; /* 减小最小高度以对应单行 */
}

.stream-toggle-inside:hover {
  color: var(--color-text);
}

.stream-toggle-inside input[type="checkbox"] {
  width: 12px;
  height: 12px;
  cursor: pointer;
}

.stream-toggle-inside .label-text {
  cursor: pointer;
}

/* 当前叙述显示区域 */
/* .current-narrative 样式已合并到 line 1996 */

.narrative-content {
  line-height: 1.8;
  color: var(--color-text);
  font-size: 0.95rem;
  background: var(--color-surface); /* 确保叙述内容区域背景一致 */
}

.stage-entry-narrative {
  padding: 18px 20px;
  border-left: 4px solid rgba(var(--color-primary-rgb), 0.72);
  background:
    linear-gradient(90deg, rgba(var(--color-primary-rgb), 0.08), transparent 42%),
    var(--color-surface);
}

.narrative-heading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.stage-entry-badge {
  padding: 2px 9px;
  border: 1px solid rgba(var(--color-primary-rgb), 0.28);
  border-radius: 999px;
  color: var(--color-primary);
  background: rgba(var(--color-primary-rgb), 0.08);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.action-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e2dccf;
  margin-bottom: 16px;
}

.action-option-btn {
  padding: 8px 16px;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
  white-space: normal;
  word-break: break-word;
  max-width: 100%;
  text-align: center;
  flex: 0 1 auto;
  min-width: 0;
}

.action-option-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(var(--color-primary-rgb), 0.4);
}

.engine-action-options {
  border-top-color: var(--color-primary);
}

.engine-action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  border-left: 4px solid var(--color-accent);
  font-weight: 650;
  text-align: left;
}

.engine-action-badge {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.key-beat-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 8px;
  padding: 10px 12px;
  border: 2px solid var(--color-primary, #4c87ad);
  border-radius: 6px;
  background: var(--color-surface-light, var(--color-surface));
}

.key-beat-card.is-highlighted {
  box-shadow: 0 0 0 3px rgba(230, 162, 60, 0.55);
  border-color: var(--color-warning, #e6a23c);
}

.key-beat-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.key-beat-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--color-primary, #4c87ad);
  border-radius: 4px;
  background: var(--color-surface);
  color: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.key-beat-option:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.key-beat-tag {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-warning, #e6a23c);
}

.key-beat-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

.intent-hold-message {
  /* 独占输入行上方一行（与判定确认卡同层），不挤占输入框。 */
  margin: 0 0 8px;
  padding: 6px 10px;
  border-left: 3px solid var(--color-warning, #e6a23c);
  border-radius: 3px;
  background: var(--color-surface-light, var(--color-surface));
  font-size: 12px;
  line-height: 1.5;
}

.branch-decision-banner {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
  padding: 6px 10px;
  border-left: 3px solid var(--color-warning, #e6a23c);
  font-size: 12px;
  line-height: 1.5;
}

.engine-action-hint {
  width: 100%;
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.other-action-label {
  margin-top: 14px;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
}

.secondary-action-options {
  margin-top: 6px;
  padding-top: 8px;
}

.secondary-action-options .action-option-btn {
  background: transparent;
  color: var(--color-primary);
  border: 1px solid var(--color-border);
  font-weight: 400;
}

.secondary-action-options .action-option-btn:hover {
  background: rgba(var(--color-primary-rgb), 0.08);
  border-color: var(--color-primary);
  box-shadow: none;
}

/* 绘图按钮 */
.header-action-btn.image-gen-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-primary);
  /* cursor: pointer; */
  padding: 6px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  margin-right: 4px;
}

.header-action-btn.image-gen-btn:hover:not(:disabled) {
  background: rgba(var(--color-primary-rgb), 0.1);
  transform: scale(1.1);
  box-shadow: 0 0 10px rgba(var(--color-primary-rgb), 0.3);
}

.header-action-btn.image-gen-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.narrative-meta {
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #efeade;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.meta-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-action-btn.rollback-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.header-action-btn.rollback-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-primary);
}

.header-action-btn.event-btn {
  background: rgba(111, 127, 168, 0.10);
  border: 1px solid rgba(111, 127, 168, 0.20);
  color: rgba(111, 127, 168, 0.95);
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.header-action-btn.event-btn:hover {
  background: rgba(111, 127, 168, 0.16);
  border-color: rgba(111, 127, 168, 0.35);
}

.travel-card { padding: 12px; margin: 8px 0; border: 1px solid var(--border-color); border-radius: 8px; }
.travel-card p { margin: 6px 0 0; }

.traveling-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  color: rgba(234, 88, 12, 0.95);
  background: rgba(234, 88, 12, 0.12);
  border: 1px solid rgba(234, 88, 12, 0.25);
  white-space: nowrap;
}

[data-theme="dark"] .header-action-btn.event-btn {
  background: rgba(111, 127, 168, 0.16);
  border-color: rgba(111, 127, 168, 0.25);
  color: rgba(165, 180, 252, 0.95);
}

[data-theme="dark"] .traveling-badge {
  color: rgba(198, 128, 76, 0.95);
  background: rgba(198, 128, 76, 0.16);
  border-color: rgba(198, 128, 76, 0.28);
}

.narrative-time {
  font-size: 0.8rem;
  color: #78736a;
  font-weight: 500;
}

/* 变量更新按钮 */
.variable-updates-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: linear-gradient(135deg, #4c87ad, #2e5878);
  color: white;
  border: none;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(76, 135, 173, 0.3);
  position: relative;
  overflow: hidden;
}

.variable-updates-toggle::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s ease;
}

.variable-updates-toggle:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(76, 135, 173, 0.4);
  background: linear-gradient(135deg, #3a6c8c, #27506b);
}

.variable-updates-toggle:hover::before {
  left: 100%;
}

.variable-updates-toggle.active {
  background: linear-gradient(135deg, #4f9b7e, #3f8268);
  box-shadow: 0 2px 8px rgba(79, 155, 126, 0.3);
}

.variable-updates-toggle.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: linear-gradient(135deg, #a29c90, #78736a);
  box-shadow: 0 2px 8px rgba(156, 163, 175, 0.3);
}

.variable-updates-toggle.disabled:hover {
  transform: none;
  background: linear-gradient(135deg, #a29c90, #78736a);
  box-shadow: 0 2px 8px rgba(156, 163, 175, 0.3);
}

.variable-updates-toggle.disabled::before {
  display: none;
}

.update-count {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
}

/* 悬浮面板覆盖层 */
.variable-updates-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  backdrop-filter: blur(4px);
}

/* 悬浮面板主体 */
.variable-updates-modal {
  background: var(--color-surface);
  border-radius: 16px;
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--color-border);
  animation: modal-appear 0.3s ease-out;
}

@keyframes modal-appear {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* 悬浮面板动画 */
.variable-updates-modal-enter-active,
.variable-updates-modal-leave-active {
  transition: all 0.3s ease;
}

.variable-updates-modal-enter-from {
  opacity: 0;
  transform: scale(0.9) translateY(20px);
}

.variable-updates-modal-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(20px);
}

/* 悬浮面板头部 */
.variable-updates-modal .updates-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #f2eee4 0%, #ddd7c9 100%);
  border-bottom: 1px solid var(--color-border);
}

.variable-updates-modal .updates-header h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
}

.close-updates-btn {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-updates-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
  transform: rotate(90deg);
}

/* 悬浮面板内容 */
.variable-updates-modal .updates-content {
  padding: 16px;
  overflow-y: auto;
  max-height: 60vh;
}

/* 移除重复的样式，让内部FormattedText组件处理 */

.empty-narrative {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #a29c90;
  font-style: italic;
  font-size: 0.9rem;
}

/* 动作队列显示区域 */
.action-queue-display {
  margin-bottom: 12px;
  background: linear-gradient(135deg, #f2eee4 0%, #ece7dc 100%);
  border: 1px solid #ddd7c9;
  border-radius: 8px;
  padding: 12px;
}

.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.queue-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #6f7fa8;
}

.clear-queue-btn {
  background: transparent;
  border: none;
  color: #a29c90;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.clear-queue-btn:hover {
  background: rgba(195, 75, 60, 0.1);
  color: #c34b3c;
}

.queue-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 150px;
  overflow-y: auto;
}

.queue-action-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(111, 127, 168, 0.05);
  border: 1px solid rgba(111, 127, 168, 0.1);
  border-radius: 6px;
  font-size: 0.85rem;
}

.action-text {
  flex: 1;
  color: #3c3934;
  line-height: 1.4;
  margin-right: 8px;
}

.action-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.undo-indicator {
  font-size: 12px;
  opacity: 0.7;
  animation: rotate 2s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.remove-action-btn {
  background: transparent;
  border: none;
  color: #a29c90;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 16px;
  line-height: 1;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.remove-action-btn:hover {
  background: rgba(195, 75, 60, 0.1);
  color: #c34b3c;
}

.input-section {
  padding: 16px 20px 20px 20px; /* 进一步增加底部内边距 */
  border-top: 1px solid #ddd7c9;
  background: #f2eee4;
  box-sizing: border-box;
  flex-shrink: 0;
}

.input-wrapper {
  display: flex;
  gap: 12px;
  align-items: stretch; /* 改为stretch让所有元素高度一致 */
  width: 100%;
  max-width: none;
}

.game-input {
  /* 这些样式现在由 .input-container 处理 */
  font-size: 0.9rem;
  line-height: 1.4;
  color: #3c3934;
  resize: none;
  /* 移除固定高度，改为自动调整 */
  /* min-height: 44px; */
  /* max-height: 120px; */
  font-family: inherit;
  /* 移除过渡效果，避免高度调整时的闪烁 */
  /* transition: all 0.2s ease; */
}

/* 移除原来的 focus 样式，现在由容器处理 */
/* .game-input:focus {
  outline: none;
  border-color: #4c87ad;
  box-shadow: 0 0 0 3px rgba(76, 135, 173, 0.1);
} */

.game-input:disabled {
  /* background: #f9fafb; */
  color: #a29c90;
  cursor: not-allowed;
}

.game-input::placeholder {
  color: #a29c90;
}

.send-button {
  width: 42px;
  background: linear-gradient(135deg, #4c87ad, #3a6c8c);
  color: white;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  min-height: 32px;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(76, 135, 173, 0.25);
  margin-left: 8px;
}

.send-button:hover:not(:disabled) {
  background: linear-gradient(135deg, #3a6c8c, #2e5878);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(76, 135, 173, 0.4);
}

.send-button:disabled {
  background: #c9c3b6;
  color: #a29c90;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 深色主题 */
[data-theme="dark"] .main-game-panel {
  background: var(--color-background);
}

/* 叙述内容深色主题 */
[data-theme="dark"] .narrative-content {
  background: var(--color-background);
  color: #ddd7c9;
}

[data-theme="dark"] .narrative-meta {
  border-bottom-color: #3c3934;
}

[data-theme="dark"] .narrative-time {
  color: #a09a8d;
}

/* 深色主题 - 变量更新按钮 */
[data-theme="dark"] .variable-updates-toggle {
  background: linear-gradient(135deg, #4c87ad, #1e3a8a);
  box-shadow: 0 2px 8px rgba(76, 135, 173, 0.4);
}

[data-theme="dark"] .variable-updates-toggle:hover {
  background: linear-gradient(135deg, #3a6c8c, #27506b);
  box-shadow: 0 4px 16px rgba(76, 135, 173, 0.5);
}

[data-theme="dark"] .variable-updates-toggle.active {
  background: linear-gradient(135deg, #4f9b7e, #065f46);
  box-shadow: 0 2px 8px rgba(79, 155, 126, 0.4);
}

[data-theme="dark"] .variable-updates-toggle.active:hover {
  background: linear-gradient(135deg, #3f8268, #047857);
  box-shadow: 0 4px 16px rgba(79, 155, 126, 0.5);
}

[data-theme="dark"] .variable-updates-toggle.disabled {
  background: linear-gradient(135deg, #4e4b45, #3c3934);
  box-shadow: 0 2px 8px rgba(75, 85, 99, 0.4);
}

[data-theme="dark"] .variable-updates-toggle.disabled:hover {
  background: linear-gradient(135deg, #4e4b45, #3c3934);
  box-shadow: 0 2px 8px rgba(75, 85, 99, 0.4);
}

[data-theme="dark"] .variable-updates-overlay {
  background: rgba(0, 0, 0, 0.7);
}

[data-theme="dark"] .variable-updates-modal {
  background: #1e2228;
  border-color: #56534b;
}

[data-theme="dark"] .variable-updates-modal .updates-header {
  background: linear-gradient(135deg, #3d3a35 0%, #56534b 100%);
  border-color: #56534b;
}

[data-theme="dark"] .variable-updates-modal .updates-header h4 {
  color: #ddd7c9;
}

[data-theme="dark"] .close-updates-btn {
  color: #a09a8d;
}

[data-theme="dark"] .close-updates-btn:hover {
  background: #56534b;
  color: #ddd7c9;
}

[data-theme="dark"] .empty-narrative {
  color: #78736a;
}

/* 确保深色主题下当前叙述区域背景一致 */
[data-theme="dark"] .current-narrative {
  background-color: #1e2228 !important;
}

/* 暗色下石青按钮是中间调，白字只有 2.5:1；改用墨字约 6.8:1 */
[data-theme="dark"] .action-option-btn {
  color: #1a1d21;
}

[data-theme="dark"] .secondary-action-options .action-option-btn {
  color: var(--color-text);
}

/* 深色主题 - 流式输出内容 */
[data-theme="dark"] .streaming-narrative-content {
  background: var(--color-surface);
  border-color: var(--color-border);
}

[data-theme="dark"] .streaming-text {
  color: #ddd7c9;
}


[data-theme="dark"] .ai-processing-display {
  background: var(--color-background) !important;
}

[data-theme="dark"] .reset-state-btn {
  background: rgba(var(--color-error-rgb), 0.2);
  color: var(--color-danger);
  border-color: rgba(var(--color-error-rgb), 0.3);
}

[data-theme="dark"] .reset-state-btn:hover {
  background: rgba(var(--color-error-rgb), 0.3);
  border-color: rgba(var(--color-error-rgb), 0.5);
}

[data-theme="dark"] .narrative-content {
  background: #1e2228 !important;
}

[data-theme="dark"] .input-section {
  background: #3d3a35;
  border-top-color: #56534b;
}

[data-theme="dark"] .game-input {
  /* background: #1e2228; - 现在由容器处理 */
  /* border-color: #56534b; - 现在由容器处理 */
  color: #ddd7c9;
}

/* 移除重复的深色主题 focus 样式 */
/* [data-theme="dark"] .game-input:focus {
  border-color: #4c87ad;
  box-shadow: 0 0 0 3px rgba(76, 135, 173, 0.2);
} */

[data-theme="dark"] .game-input:disabled {
  /* background: #12151a; - 现在由容器处理 */
  color: #7c776c;
}

[data-theme="dark"] .game-input::placeholder {
  color: #7c776c;
}

[data-theme="dark"] .send-button {
  background: #4c87ad;
}

[data-theme="dark"] .send-button:hover:not(:disabled) {
  background: #3a6c8c;
}

[data-theme="dark"] .send-button:disabled {
  background: #3c3934;
  color: #7c776c;
}

/* 短期记忆深色主题 */
[data-theme="dark"] .memory-section {
  background: linear-gradient(135deg, #1e2228 0%, #3d3a35 100%);
  border-color: #56534b;
}

[data-theme="dark"] .memory-header:hover {
  background: rgba(111, 127, 168, 0.1);
}

[data-theme="dark"] .memory-title {
  color: #8b95b8;
}

[data-theme="dark"] .memory-icon {
  color: #7c776c;
}

[data-theme="dark"] .memory-dropdown {
  background: #1e2228;
  border-color: #56534b;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

[data-theme="dark"] .memory-item {
  background: rgba(129, 140, 248, 0.1);
  border-left-color: #8b95b8;
  color: #ddd7c9;
}

/* 思维链深色主题 */
[data-theme="dark"] .thinking-section {
  background: linear-gradient(135deg, #422006 0%, #451a03 100%);
  border-color: #92400e;
}

[data-theme="dark"] .thinking-header:hover {
  background: rgba(213, 170, 74, 0.1);
}

[data-theme="dark"] .thinking-icon {
  color: #d5aa4a;
}

[data-theme="dark"] .thinking-title {
  color: #dfc06f;
}

[data-theme="dark"] .thinking-badge.streaming {
  color: #dfc06f;
  background: rgba(213, 170, 74, 0.2);
}

[data-theme="dark"] .thinking-badge.completed {
  color: #9dc5a3;
  background: rgba(95, 155, 106, 0.15);
}

[data-theme="dark"] .expand-icon {
  color: #d5aa4a;
}

[data-theme="dark"] .thinking-content {
  background: rgba(0, 0, 0, 0.2);
  border-top-color: rgba(213, 170, 74, 0.2);
  color: #fef3c7;
}

/* 等待覆盖层深色主题 - 更新为AI处理显示样式 */
[data-theme="dark"] .streaming-meta {
  border-bottom-color: #3c3934;
}

[data-theme="dark"] .streaming-indicator {
  color: #78a8c6;
}

[data-theme="dark"] .streaming-dot {
  background: #78a8c6;
}

[data-theme="dark"] .thinking-dots .dot {
  background: #78a8c6;
}

[data-theme="dark"] .waiting-text {
  color: #a09a8d;
}

/* 输入框右侧流式传输选项深色主题 - 更新为内部样式 */
[data-theme="dark"] .input-container {
  background: #1e2228;
  border-color: #56534b;
}

[data-theme="dark"] .input-container:focus-within {
  border-color: #4c87ad;
  box-shadow: 0 0 0 3px rgba(76, 135, 173, 0.2);
}

[data-theme="dark"] .input-container:has(.game-input:disabled) {
  background: #12151a;
}

[data-theme="dark"] .stream-toggle-inside {
  color: #a09a8d;
  border-left-color: #56534b;
}

[data-theme="dark"] .stream-toggle-inside:hover {
  color: #ddd7c9;
}

/* 行动选择器按钮 */
.action-selector-btn {
  width: 44px;
  min-height: 32px; /* 减小最小高度以匹配输入框 */
  background: #f2eee4;
  border: 1px solid #ddd7c9;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #6f7fa8;
  align-self: stretch; /* 垂直拉伸以匹配容器高度 */
  flex-shrink: 0;
}

.action-selector-btn:hover:not(:disabled) {
  background: #ece7dc;
  border-color: #6f7fa8;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(111, 127, 168, 0.15);
}

.action-selector-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 行动选择弹窗 */
.action-modal-overlay,
.action-config-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.action-modal {
  background: var(--color-surface);
  border-radius: 12px;
  max-width: 480px;
  width: 90%;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.action-config-modal {
  background: var(--color-surface);
  border-radius: 12px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.modal-header,
.config-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e2dccf;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--color-primary, #4c87ad);
}

.modal-header h3,
.config-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: white;
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: var(--color-surface-light);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
}

.action-grid {
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.quick-action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  border: 1px solid #e2dccf;
  border-radius: 8px;
  background: var(--color-surface);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.8rem;
  min-height: 70px;
}

.quick-action-btn:hover {
  border-color: #4c87ad;
  background: #f2eee4;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(76, 135, 173, 0.15);
}

.quick-action-btn.cultivation {
  border-color: rgba(95, 155, 106, 0.2);
  background: rgba(95, 155, 106, 0.03);
}

.quick-action-btn.cultivation:hover {
  border-color: #5f9b6a;
  background: rgba(95, 155, 106, 0.08);
}

.quick-action-btn.exploration {
  border-color: rgba(76, 135, 173, 0.2);
  background: rgba(76, 135, 173, 0.03);
}

.quick-action-btn.exploration:hover {
  border-color: #4c87ad;
  background: rgba(76, 135, 173, 0.08);
}

.quick-action-btn.social {
  border-color: rgba(20, 184, 166, 0.2);
  background: rgba(20, 184, 166, 0.03);
}

.quick-action-btn.social:hover {
  border-color: #14b8a6;
  background: rgba(20, 184, 166, 0.08);
}

.quick-action-btn.other {
  border-color: rgba(156, 163, 175, 0.2);
  background: rgba(156, 163, 175, 0.03);
}

.quick-action-btn.other:hover {
  border-color: #a29c90;
  background: rgba(156, 163, 175, 0.08);
}

.action-icon {
  font-size: 1.2rem;
  line-height: 1;
}

.action-text {
  font-weight: 500;
  color: #3c3934;
  text-align: center;
  line-height: 1.2;
}

/* 配置弹窗内容 */
.config-content {
  padding: 20px;
}

.action-description {
  margin: 0 0 20px 0;
  color: #78736a;
  line-height: 1.5;
}

.config-section {
  margin-bottom: 20px;
}

.config-section:last-child {
  margin-bottom: 0;
}

.config-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #3c3934;
  font-size: 0.875rem;
}

.time-selector {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.time-btn {
  padding: 8px 16px;
  border: 1px solid #c9c3b6;
  border-radius: 6px;
  background: var(--color-surface);
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s ease;
}

.time-btn:hover {
  border-color: #4c87ad;
}

.time-btn.active {
  border-color: #4c87ad;
  background: #4c87ad;
  color: white;
}

.time-custom {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
}

.time-input {
  width: 80px;
  padding: 6px 10px;
  border: 1px solid #c9c3b6;
  border-radius: 4px;
  font-size: 0.875rem;
}

.action-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid #e2dccf;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.option-item:hover {
  border-color: #4c87ad;
  background: #f2eee4;
}

.option-item input[type="radio"] {
  margin: 0;
}

.config-actions {
  padding: 20px;
  border-top: 1px solid #e2dccf;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.cancel-btn,
.confirm-btn {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-btn {
  border: 1px solid #c9c3b6;
  background: var(--color-surface);
  color: #78736a;
}

.cancel-btn:hover {
  background: #f9fafb;
  border-color: #a29c90;
}

.confirm-btn {
  border: 1px solid #4c87ad;
  background: #4c87ad;
  color: white;
}

.confirm-btn:hover {
  background: #3a6c8c;
  border-color: #3a6c8c;
}

/* 深色主题适配 */
[data-theme="dark"] .action-selector-btn {
  background: #3c3934;
  border-color: #4e4b45;
  color: #c9c3b6;
}

[data-theme="dark"] .action-selector-btn:hover:not(:disabled) {
  background: #4e4b45;
  border-color: #78736a;
}

[data-theme="dark"] .action-modal,
[data-theme="dark"] .action-config-modal {
  background: #212429;
}

[data-theme="dark"] .modal-header,
[data-theme="dark"] .config-header,
[data-theme="dark"] .config-actions {
  border-color: #3c3934;
}

[data-theme="dark"] .modal-header h3,
[data-theme="dark"] .config-header h3,
[data-theme="dark"] .category-title,
[data-theme="dark"] .config-label,
[data-theme="dark"] .action-name {
  color: #f9fafb;
}

[data-theme="dark"] .close-btn {
  background: #3c3934;
  color: #c9c3b6;
}

[data-theme="dark"] .close-btn:hover {
  background: #4e4b45;
  color: #f9fafb;
}

[data-theme="dark"] .action-btn {
  background: #3c3934;
  border-color: #4e4b45;
}

[data-theme="dark"] .action-btn:hover {
  border-color: #4c87ad;
  background: #212429;
}

[data-theme="dark"] .time-btn,
[data-theme="dark"] .option-item {
  background: #3c3934;
  border-color: #4e4b45;
  color: #c9c3b6;
}

[data-theme="dark"] .time-input {
  background: #3c3934;
  border-color: #4e4b45;
  color: #f9fafb;
}

[data-theme="dark"] .cancel-btn {
  background: #3c3934;
  border-color: #4e4b45;
  color: #c9c3b6;
}

[data-theme="dark"] .cancel-btn:hover {
  background: #4e4b45;
}

/* 深色主题动作队列样式 */
[data-theme="dark"] .action-queue-display {
  background: linear-gradient(135deg, #3c3934 0%, #212429 100%);
  border-color: #4e4b45;
}

[data-theme="dark"] .queue-title {
  color: #8b95b8;
}

[data-theme="dark"] .clear-queue-btn {
  color: #a29c90;
}

[data-theme="dark"] .clear-queue-btn:hover {
  background: rgba(195, 75, 60, 0.2);
  color: #cd6f5f;
}

[data-theme="dark"] .queue-action-item {
  background: rgba(129, 140, 248, 0.1);
  border-color: rgba(129, 140, 248, 0.2);
}

[data-theme="dark"] .action-text {
  color: #e2dccf;
}

[data-theme="dark"] .remove-action-btn {
  color: #a29c90;
}

[data-theme="dark"] .remove-action-btn:hover {
  background: rgba(195, 75, 60, 0.2);
  color: #cd6f5f;
}

[data-theme="dark"] .action-controls {
  color: #c9c3b6;
}

[data-theme="dark"] .undo-indicator {
  filter: brightness(1.2);
}

/* 变更描述样式 */
.change-description {
  color: var(--color-text);
  font-size: 0.8rem;
  margin-bottom: 6px;
  padding: 4px 8px;
  background: var(--color-surface-light);
  border-radius: 4px;
  border-left: 2px solid var(--color-primary);
  line-height: 1.3;
  font-style: italic;
}

/* 深色主题下的变更描述 */
[data-theme="dark"] .change-description {
  background: #3d3a35;
  color: #ddd7c9;
  border-left-color: #78a8c6;
}

/* 空状态样式 */
.no-changes {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  color: var(--color-text-secondary);
}

.no-changes .empty-icon {
  opacity: 0.5;
  margin-bottom: 1rem;
  color: var(--color-text-secondary);
}

.no-changes .empty-text {
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--color-text);
  font-size: 0.9rem;
}

.no-changes .empty-hint {
  font-size: 0.8rem;
  opacity: 0.8;
  line-height: 1.4;
}

/* 图片预览容器样式 */
.image-preview-container {
  display: flex;
  gap: 8px;
  padding: 8px;
  flex-wrap: wrap;
  border-bottom: 1px solid #e2dccf;
  background: #f9fafb;
}

.image-preview-item {
  position: relative;
  width: 60px;
  height: 60px;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid #e2dccf;
  transition: all 0.2s ease;
}

.image-preview-item:hover {
  border-color: #4c87ad;
  transform: scale(1.05);
}

.image-preview-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove-image-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  padding: 0;
  background: rgba(195, 75, 60, 0.9);
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s ease;
}

.image-preview-item:hover .remove-image-btn {
  opacity: 1;
}

.remove-image-btn:hover {
  background: rgba(168, 58, 44, 1);
  transform: scale(1.1);
}

/* 图片上传按钮特殊样式 */
.image-upload-btn svg {
  color: #4f9b7e;
}

.image-upload-btn:hover:not(:disabled) svg {
  color: #3f8268;
}

/* 深色主题图片预览样式 */
[data-theme="dark"] .image-preview-container {
  background: #12151a;
  border-bottom-color: #56534b;
}

[data-theme="dark"] .image-preview-item {
  border-color: #56534b;
}

[data-theme="dark"] .image-preview-item:hover {
  border-color: #4c87ad;
}

/* 最新消息text样式 */
.latest-message-text {
  margin-top: 20px;
  padding: 16px;
  background: #f2eee4;
  border: 1px solid #ddd7c9;
  border-left: 4px solid #8b95b8;
  border-radius: 8px;
  font-size: 0.9rem;
  color: #56534b;
  line-height: 1.7;
}

.latest-text-header {
  font-weight: 600;
  color: #6f7fa8;
  margin-bottom: 8px;
  font-size: 0.85rem;
}

[data-theme="dark"] .latest-message-text {
  background: #3d3a35;
  border-color: #4e4b45;
  border-left-color: #8b95b8;
  color: #c4bdad;
}

[data-theme="dark"] .latest-text-header {
  color: #aab3cc;
}

/* Cultivation Panel */
.cultivation-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001; /* Higher than action modal */
  backdrop-filter: blur(4px);
}

.cultivation-panel {
  background: linear-gradient(145deg, #f9fafb, #efeade);
  border-radius: 16px;
  width: 90%;
  max-width: 800px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  flex-direction: column;
  animation: modal-appear 0.4s cubic-bezier(0.25, 1, 0.5, 1);
}

.cultivation-panel .panel-header {
  padding: 16px 24px;
  border-bottom: 1px solid #e2dccf;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cultivation-panel .panel-header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #212429;
  display: flex;
  align-items: center;
  gap: 10px;
}

.cultivation-panel .panel-content {
  padding: 24px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 24px;
}

.cultivation-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #e2dccf;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.cultivation-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.08);
  border-color: #aab3cc;
}

.cultivation-card .card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.cultivation-card .card-icon {
  color: #6f7fa8;
}
.cultivation-zap .card-icon { color: #c69431; }
.cultivation-shield .card-icon { color: #4c87ad; }
.cultivation-braincircuit .card-icon { color: #8a6fa8; }

.cultivation-card .card-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #14171b;
}

.cultivation-card .card-description {
  font-size: 0.85rem;
  color: #4e4b45;
  line-height: 1.6;
  flex-grow: 1;
  margin: 0 0 16px 0;
}

.cultivation-card .card-config {
  margin-bottom: 16px;
}

.cultivation-card .config-label {
  font-size: 0.8rem;
  font-weight: 500;
  color: #78736a;
  margin-bottom: 8px;
  display: block;
}

.cultivation-card .time-selector {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cultivation-card .time-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  background: #e2dccf;
  border-radius: 3px;
  outline: none;
  opacity: 0.7;
  transition: opacity .2s;
}
.cultivation-card .time-slider:hover {
  opacity: 1;
}
.cultivation-card .time-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #6f7fa8;
  cursor: pointer;
  border-radius: 50%;
}
.cultivation-card .time-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #6f7fa8;
  cursor: pointer;
  border-radius: 50%;
}

.cultivation-card .time-display {
  font-size: 0.9rem;
  font-weight: 600;
  color: #212429;
  min-width: 50px;
  text-align: right;
}

.start-cultivation-btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: #5a5f8f;
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}
.start-cultivation-btn:hover {
  background: #4338ca;
  transform: translateY(-2px);
  box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3);
}

.cultivation-zap .start-cultivation-btn { background: #c69431; }
.cultivation-zap .start-cultivation-btn:hover { background: #a97528; box-shadow: 0 4px 10px rgba(198, 148, 49, 0.3); }
.cultivation-shield .start-cultivation-btn { background: #4c87ad; }
.cultivation-shield .start-cultivation-btn:hover { background: #3a6c8c; box-shadow: 0 4px 10px rgba(76, 135, 173, 0.3); }
.cultivation-braincircuit .start-cultivation-btn { background: #8a6fa8; }
.cultivation-braincircuit .start-cultivation-btn:hover { background: #70518f; box-shadow: 0 4px 10px rgba(138, 111, 168, 0.3); }

/* Dark theme for cultivation panel */
[data-theme="dark"] .cultivation-panel {
  background: linear-gradient(145deg, #212429, #14171b);
  border-color: #3c3934;
}
[data-theme="dark"] .cultivation-panel .panel-header {
  border-color: #3c3934;
}
[data-theme="dark"] .cultivation-panel .panel-header h3 {
  color: #efeade;
}
[data-theme="dark"] .cultivation-card {
  background: #212429;
  border-color: #3c3934;
}
[data-theme="dark"] .cultivation-card:hover {
  border-color: #aab3cc;
}
[data-theme="dark"] .cultivation-card .card-title {
  color: #f9fafb;
}
[data-theme="dark"] .cultivation-card .card-description {
  color: #a29c90;
}
[data-theme="dark"] .cultivation-card .config-label {
  color: #a29c90;
}
[data-theme="dark"] .cultivation-card .time-slider {
  background: #4e4b45;
}
[data-theme="dark"] .cultivation-card .time-display {
  color: #efeade;
}


.judgement-preflight-card {
  margin: 8px 12px;
  padding: 12px;
  border: 1px solid #d6a85a;
  border-radius: 8px;
  background: linear-gradient(135deg, #fffaf0, #fff);
  color: #4b3518;
}
.judgement-result-card { margin: 8px 12px; padding: 10px 12px; border-left: 4px solid #5d8a5d; border-radius: 6px; background: #f2f8f0; color: #274227; }
[data-theme="dark"] .judgement-result-card { background: #1f3120; color: #d8ead6; border-color: #7caf76; }
.judgement-preflight-title { font-weight: 700; color: #9a6517; }
.judgement-preflight-action { margin-top: 4px; font-weight: 600; }
.judgement-preflight-card p, .judgement-preflight-card small { display: block; margin: 7px 0; line-height: 1.5; }
.judgement-preflight-factors { display: flex; flex-wrap: wrap; gap: 6px; }
.judgement-preflight-factors span { padding: 2px 6px; border-radius: 4px; background: #f4e6c9; font-size: .8rem; }
.judgement-preflight-actions { display: flex; gap: 8px; margin-top: 10px; }
.judgement-preflight-actions button { border: 0; border-radius: 5px; padding: 6px 10px; cursor: pointer; background: #9a6517; color: white; }
.judgement-preflight-actions button:nth-child(2), .judgement-preflight-actions button:nth-child(3) { background: #7a6c57; }
.judgement-preflight-actions .test-great-success-button { background: #4f8a3f; font-weight: 700; }
.judgement-preflight-actions button:disabled { opacity: .5; cursor: not-allowed; }
[data-theme="dark"] .judgement-preflight-card { background: #30281d; color: #eadcc2; border-color: #a77b35; }
[data-theme="dark"] .judgement-preflight-title { color: #f0c878; }
[data-theme="dark"] .judgement-preflight-factors span { background: #4a3c28; }

/* 手机端响应式修复 */
@media (max-width: 768px) {
  .main-game-panel {
    width: 100%;
    max-width: 100vw;
    overflow-x: hidden;
  }

  .content-area {
    padding: 4px;
    overflow-x: hidden;
    width: 100%;
    box-sizing: border-box;
  }

  .current-narrative {
    min-width: 0;
    max-width: 100%;
    overflow-x: hidden;
    width: 100%;
  }

  .streaming-narrative-content,
  .narrative-content {
    overflow-x: hidden;
    word-wrap: break-word;
    overflow-wrap: break-word;
    max-width: 100%;
    padding: 8px;
  }

  .streaming-text,
  .narrative-text {
    max-width: 100%;
    overflow-x: hidden;
    word-wrap: break-word;
    overflow-wrap: break-word;
    font-size: 0.85rem;
  }

  .input-wrapper {
    gap: 4px;
    padding: 4px;
    width: 100%;
    box-sizing: border-box;
  }

  .input-container {
    min-width: 0;
    flex: 1;
  }

  .game-input {
    font-size: 0.85rem;
    padding: 6px 8px;
  }

  .send-button {
    padding: 8px 12px;
    flex-shrink: 0;
    min-width: 44px;
  }

  .stream-toggle-inside {
    font-size: 0.75rem;
    padding: 0 6px;
  }
}
</style>
