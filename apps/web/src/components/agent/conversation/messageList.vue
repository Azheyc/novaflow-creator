<template>
  <div class="messageViewport t-chat t-chat--normal">
    <div ref="messageList" class="messageList t-chat__list" role="region" aria-label="对话消息" tabindex="0">
      <chat-item v-if="!messages.length && !disabled" role="assistant" variant="text">
        <template #content>
          <section class="welcomeMessage" aria-label="开始新对话">
            <div class="welcomeHeader">
              <span class="welcomeIcon" aria-hidden="true"><span class="welcomeLogo" :style="{ maskImage: `url(${logoUrl})` }" /></span>
              <div>
                <p class="welcomeLabel">你好，我是 NovaFlow 助手</p>
                <h3>从一个想法开始</h3>
              </div>
            </div>
            <p class="welcomeDescription">从已有的故事、对白或素材继续，选择这次想完成的内容。</p>
            <div class="welcomeSuggestions">
              <el-button v-for="item in welcomeSuggestions" :key="item.label" class="welcomeSuggestion" text bg :disabled="locked" :aria-label="`填入提示：${item.label}`" @click="emit('fillPrompt', item.prompt)">
                <component :is="item.icon" :size="19" aria-hidden="true" />
                <span class="suggestionContent"><strong>{{ item.label }}</strong><span>{{ item.description }}</span></span>
                <icon-arrow-up-right class="suggestionArrow" :size="15" aria-hidden="true" />
              </el-button>
            </div>
            <p class="welcomeHint">点击填入提示，也可以直接输入，或添加图片、视频和文档。</p>
          </section>
        </template>
      </chat-item>
      <div class="messageSpace" :style="{ height: `${messageVirtualizer.getTotalSize()}px` }">
        <div
          v-for="{ item, row } in visibleMessages"
          :key="item.id"
          :ref="measureMessage"
          :data-index="row.index"
          :data-message-id="item.id"
          :data-live-message="item.streaming || item.id === browserMessages.liveMessageId || undefined"
          class="messageRow"
          :style="{ transform: `translateY(${row.start}px)` }"
          :class="{ userMessage: item.role === 'user', editingMessage: editingId === item.id }">
          <chat-item :role="item.role" :variant="item.role === 'user' ? 'base' : 'text'" :textLoading="!!item.streaming && !compacting && !item.parts?.some(part => part.type === 'tool' || part.content)" animation="moving" @vue:updated="measureMessage($event.el?.parentElement ?? null)">
            <template #content>
              <div class="messageContent">
                <span v-if="item.role === 'user' && item.delivery?.mode === 'steer'" class="steeringLabel" title="当前任务的补充引导，已完成的操作不会撤销"><icon-corner-down-right :size="14" aria-hidden="true" />引导</span>
                <div v-if="item.report" class="reportHeader"><icon-users-group :size="14" />{{ item.report.name }} 上报</div>
                <div v-if="item.agentMessage" class="reportHeader"><icon-users-group :size="14" />来自 {{ item.agentMessage.fromName }} 的消息</div>
                <template v-for="section in messageSections.get(item.id)" :key="section.id">
                  <el-button v-if="section.process" class="processToggle" text size="small" :aria-expanded="expandedProcesses.has(item.id)" :aria-controls="`agentProcess-${item.id}`" @click="toggleProcess(item.id)">
                    <component :is="expandedProcesses.has(item.id) ? IconChevronDown : IconChevronRight" :size="14" />
                    {{ expandedProcesses.has(item.id) ? '收起运行过程' : '展开运行过程' }}
                    <span v-if="section.toolCount">（{{ section.toolCount }} 次工具调用）</span>
                  </el-button>
                  <div v-if="!section.process || expandedProcesses.has(item.id)" :id="section.process ? `agentProcess-${item.id}` : undefined" class="messageSection" :class="{ processContent: section.process }">
                    <template v-for="part in section.parts" :key="part.id">
                      <chat-reasoning v-if="part.type === 'thinking' && part.content" class="messageReasoning" :collapsed="part.collapsed ?? true" expandIconPlacement="left" @update:collapsed="part.collapsed = $event">
                        <template #expandIcon><component :is="(part.collapsed ?? true) ? IconChevronRight : IconChevronDown" :size="14" aria-hidden="true" /></template>
                        <template #header>
                          <span class="reasoningHeader">
                            <icon-atom :size="14" />
                            <span>思考</span>
                            <span v-if="part.duration !== undefined" class="thinkingDuration">{{ part.duration.toFixed(1) }} 秒</span>
                          </span>
                        </template>
                        <messageMarkdown v-if="!(part.collapsed ?? true)" :content="part.content" :streaming="!!item.streaming" :directory="directory" />
                      </chat-reasoning>
                      <toolMessage v-else-if="part.type === 'tool' && !isBrowserTool(part.tool)" v-model:collapsed="part.collapsed" :tool="part.tool" :directory="directory" @copy="emit('copy', $event)" />
                      <messageMarkdown v-else-if="part.type === 'text' && part.content" :content="part.content" :streaming="!!item.streaming" :directory="directory" />
                    </template>
                    <browserPanel v-if="section.process && browserMessages.tools.has(item.id)" class="browserPreview" :tools="browserMessages.tools.get(item.id)!" :directory="directory" :active="active" :live="false" />
                  </div>
                </template>
                <attachmentList v-if="item.attachments?.length" :attachments="item.attachments" :directory="directory" />
                <div v-if="item.role === 'user'" class="messageText"><mentionContent :content="item.content" :mentions="item.mentions" :directory="directory" /></div>
                <div v-if="item.error" class="messageError" role="alert">{{ item.error }}</div>
              </div>
            </template>
          </chat-item>
          <div v-if="!item.streaming" class="messageActions">
            <template v-if="editingId === item.id">
              <el-button text size="small" :disabled="busy || deletingId !== undefined || voiceActive" @click="emit('cancelEdit')"><icon-x :size="14" />取消</el-button>
              <span class="editingHint">正在下方编辑</span>
            </template>
            <template v-else>
              <el-button v-if="item.content" class="messageAction" text circle aria-label="复制消息" title="复制消息" @click="emit('copy', mentionPlainText(item.content, item.mentions))"><icon-copy :size="14" /></el-button>
              <template v-if="item.role === 'user'">
                <el-button class="messageAction" text circle :disabled="locked || remoteRunning" aria-label="编辑消息" title="编辑消息" @click="emit('edit', item)"><icon-pencil :size="14" /></el-button>
              </template>
              <el-button v-if="!item.report && !item.agentMessage" class="messageAction" text circle :loading="branchingId === item.id" :disabled="locked || remoteRunning || !(item.entryId || item.replyTo)" aria-label="从此消息创建分支" title="从此消息创建分支" @click="emit('branch', item)"><icon-arrow-fork v-if="branchingId !== item.id" :size="14" style="transform: rotate(90deg)" aria-hidden="true" /></el-button>
              <el-button v-if="!item.report && !item.agentMessage" class="messageAction" text circle :loading="deletingId === item.id" :disabled="locked || remoteRunning" aria-label="删除消息" title="删除消息" @click="emit('delete', item)"><icon-trash v-if="deletingId !== item.id" :size="14" /></el-button>
            </template>
          </div>
          <browserPanel v-if="!messageSections.get(item.id)?.some(section => section.process) && browserMessages.tools.has(item.id)" class="browserPreview" :tools="browserMessages.tools.get(item.id)!" :directory="directory" :active="active" :live="item.id === browserMessages.liveMessageId" />
        </div>
      </div>
    </div>
    <el-button v-if="messages.length && !atLatestMessage" class="scrollBottom" circle aria-label="回到最新消息" title="回到最新消息" @click="messageVirtualizer.scrollToEnd()"><icon-arrow-down :size="18" /></el-button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUpdated, ref, watch, type ComponentPublicInstance } from "vue";
import { defaultRangeExtractor, observeElementRect, useVirtualizer } from "@tanstack/vue-virtual";
import { IconArrowDown, IconArrowFork, IconArrowUpRight, IconAtom, IconChevronDown, IconChevronRight, IconCopy, IconCornerDownRight, IconMovie, IconPencil, IconPhoto, IconTrash, IconUsersGroup, IconVector, IconX } from "@tabler/icons-vue";
import logoUrl from "@toonflow/assets/logo.svg";
import browserPanel from "@toonflow/tool-browser/panel";
import { isBrowserTool } from "@toonflow/tool-browser/client";
import type { AgentToolCall } from "@toonflow/server/agent/types";
import chatItem from "@tdesign-vue-next/chat/es/chat-item";
import chatReasoning from "@tdesign-vue-next/chat/es/chat-reasoning";
import messageMarkdown from "@/components/messageMarkdown.vue";
import attachmentList from "../attachmentList.vue";
import mentionContent from "../mentionContent.vue";
import { mentionPlainText } from "../mentionText";
import toolMessage from "../toolMessage.vue";
import type { AgentMessage, AgentMessagePart } from "../types";
import "tdesign-vue-next/es/style/index.css";
import "@tdesign-vue-next/chat/es/style/index.css";

const props = defineProps<{ messages: AgentMessage[]; directory?: string; active: boolean; disabled: boolean; locked: boolean; busy: boolean; remoteRunning: boolean; compacting: boolean; editingId?: string; deletingId?: string; branchingId?: string; voiceActive: boolean }>();
const emit = defineEmits<{ fillPrompt: [prompt: string]; copy: [content: string]; edit: [message: AgentMessage]; branch: [message: AgentMessage]; delete: [message: AgentMessage]; cancelEdit: [] }>();
const expandedProcesses = ref(new Set<string>());
function toggleProcess(id: string) {
  if (expandedProcesses.value.has(id)) expandedProcesses.value.delete(id);
  else expandedProcesses.value.add(id);
  void nextTick(() => messageVirtualizer.value.measure());
}
type MessageSection = { id: string; parts: AgentMessagePart[]; process?: boolean; toolCount?: number };
const messageSections = computed(() => {
  const running = props.busy || props.remoteRunning || props.compacting;
  const currentTask = props.messages.findLastIndex(message => message.role === "user" && message.delivery?.mode !== "steer");
  return new Map(props.messages.map((message, index) => {
    const parts = message.parts ?? [];
    const boundary = parts.findLastIndex(part => part.type !== "text");
    const finalParts = parts.slice(boundary + 1);
    const completed = message.role === "assistant" && !message.streaming && !message.error && !message.report && !message.agentMessage
      && !(running && index > currentTask) && !parts.some(part => part.type === "tool" && part.tool.status === "running");
    const sections: MessageSection[] = completed && boundary >= 0 && finalParts.some(part => part.type === "text" && part.content.trim())
      ? [{ id: "process", process: true, parts: parts.slice(0, boundary + 1), toolCount: parts.filter(part => part.type === "tool").length }, { id: "final", parts: finalParts }]
      : [{ id: "content", parts }];
    return [message.id, sections];
  }));
});
watch(() => [...messageSections.value].filter(([, sections]) => sections.some(section => section.process)).map(([id]) => id), (current, previous) => {
  for (const id of current) if (!previous?.includes(id)) expandedProcesses.value.delete(id);
}, { flush: "sync" });
const browserMessages = computed(() => {
  const groups = new Map<string, { id: string; tools: AgentToolCall[] }>();
  const taskIds = new Map<string, string>();
  let turnId: string | undefined;
  let liveMessageId: string | undefined;
  for (const message of props.messages) {
    if (message.role === "user") {
      const userId = message.entryId ?? message.id;
      const taskId = message.delivery?.taskMessageId ?? userId;
      taskIds.set(userId, taskId);
      if (taskId !== turnId) {
        turnId = taskId;
        liveMessageId = undefined;
      }
      continue;
    }
    const taskId = message.delivery?.taskMessageId ?? (message.replyTo ? taskIds.get(message.replyTo) ?? message.replyTo : undefined);
    if (taskId && taskId !== turnId) {
      turnId = taskId;
      liveMessageId = undefined;
    }
    const tools = message.parts?.flatMap(part => part.type === "tool" && isBrowserTool(part.tool) ? [part.tool] : []);
    if (!tools?.length) continue;
    const replyId = turnId ?? message.id;
    let group = groups.get(replyId);
    if (!group) { group = { id: message.id, tools: [] }; groups.set(replyId, group); }
    group.tools.push(...tools);
    liveMessageId = group.id;
  }
  return { tools: new Map([...groups.values()].map(group => [group.id, group.tools])), liveMessageId };
});
// 同轮浏览器调用共用该轮首条浏览器消息底部的画面，原始工具记录仍完整保留。
const displayedMessages = computed(() => props.messages.filter(message => browserMessages.value.tools.has(message.id) || message.role === "user" || message.error || message.report || message.agentMessage || message.attachments?.length ||
  !message.parts?.length || message.parts.some(part => part.type !== "tool" || !isBrowserTool(part.tool))));
const messageList = ref<HTMLDivElement>();
const atLatestMessage = ref(true);
let messageListInitialized = false;
let messageScrollOffset = 0;
const messageKeys = computed(() => displayedMessages.value.map(item => item.id));
// ACT: 只常驻当前轮的实时画面，历史浏览器消息仍按需挂载，避免长对话累积连接和 DOM。
const retainedMessages = computed(() => displayedMessages.value.flatMap((item, index) => item.streaming || item.id === props.editingId || item.id === browserMessages.value.liveMessageId ? [index] : []));
const messageVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>(computed(() => {
  const keys = messageKeys.value;
  const retained = retainedMessages.value;
  return {
    count: keys.length,
    getScrollElement: () => messageList.value ?? null,
    getItemKey: (index: number) => keys[index]!,
    estimateSize: () => 240,
    overscan: 3,
    paddingStart: 12,
    anchorTo: "end" as const,
    followOnAppend: true,
    scrollEndThreshold: 48,
    measureElement: (element, _entry, instance) => {
      const height = props.active ? element.offsetHeight : 0;
      if (height) return height;
      // active 先于祖先 v-show 恢复；隐藏时不能把零高度写入缓存。
      const index = instance.indexFromElement(element);
      return instance.itemSizeCache.get(instance.options.getItemKey(index)) ?? instance.options.estimateSize(index);
    },
    // ACT: v-show 隐藏时保留视口与行高，避免零尺寸清空正在输入的工具表单。
    observeElementRect: (instance, onChange) => observeElementRect(instance, rect => { if (rect.height) onChange(rect); }),
    rangeExtractor: range => [...new Set([...defaultRangeExtractor(range), ...retained])].sort((left, right) => left - right),
    onChange(instance) {
      if (!messageListInitialized || !props.active || !messageList.value?.clientHeight) return;
      atLatestMessage.value = instance.isAtEnd();
      messageScrollOffset = instance.scrollOffset ?? 0;
    },
  };
}));
const visibleMessages = computed(() => messageVirtualizer.value.getVirtualItems().map(row => ({ row, item: displayedMessages.value[row.index]! })));
// Vue 适配层未在尺寸更新后调用此钩子；占位高度提交后补偿被浏览器截断的滚动。
onUpdated(() => messageVirtualizer.value._willUpdate());
let messageMeasurePending = false;

function measureMessage(element: Element | ComponentPublicInstance | null) {
  const instance = messageVirtualizer.value;
  if (!(element instanceof HTMLDivElement) || !props.active || !element.offsetHeight || !atLatestMessage.value || !element.dataset.liveMessage) {
    instance.measureElement(element instanceof HTMLDivElement ? element : null);
    return;
  }
  const index = instance.indexFromElement(element);
  const height = element.offsetHeight;
  const changed = instance.itemSizeCache.get(instance.options.getItemKey(index)) !== height;
  instance.measureElement(element);
  // 滚动期间库可能跳过同步测量；在本次 DOM 提交内校正，避免画面随换行先下移再被拉回。
  instance.resizeItem(index, height);
  if (!changed || messageMeasurePending) return;
  messageMeasurePending = true;
  void nextTick(() => {
    messageMeasurePending = false;
    if (props.active && atLatestMessage.value) instance.scrollToEnd();
  });
}

watch([() => props.active, messageList], async ([active, element]) => {
  if (!active || !element) return;
  await nextTick();
  if (!props.active) return;
  if (!messageListInitialized || atLatestMessage.value) messageVirtualizer.value.scrollToEnd();
  else messageVirtualizer.value.scrollToOffset(messageScrollOffset);
  messageListInitialized = true;
}, { immediate: true, flush: "post" });
const welcomeSuggestions = [
  { label: "故事创作", description: "把点子写成故事，或继续修改已有稿", icon: IconVector, prompt: "请使用故事创作技能（laotang-storycraft-zh），根据我提供的材料创作或修改故事。沿用已确认的设定，只处理这次指定的范围，不自动进入分镜或媒体生成。我的想法或修改要求：" },
  { label: "电影级分镜", description: "把已有故事或对白整理成中文分镜提示词", icon: IconMovie, prompt: "请使用电影级分镜技能（laotang-cinematic-storyboard-s9），把我提供的故事、剧本或对白整理成中文视频分镜提示词。默认先给简易预览；如果我明确要求完整提示词则直接完整交付。不重写已定剧情，不自动生成视频。故事或对白：" },
  { label: "提取故事资产", description: "整理人物、道具、场景与跨场状态", icon: IconVector, prompt: "请使用故事资产提取技能（laotang-asset-extractor），从我指定的故事范围提取人物、道具、场景和场次关联，保留证据、稳定编号与状态。先完成资产整理，不自动生图。故事材料或范围：" },
  { label: "角色资产板", description: "根据人物设定制作角色参考板提示词", icon: IconPhoto, prompt: "请使用角色资产板技能（laotang-character-board），将我提供的人物设定或已有角色资产卡整理成完整中文角色板提示词。沿用已确认的模式、外观和版本；缺少设计依据时指出必要缺项，不自动生图。人物设定或参考：" },
  { label: "场景补充视角", description: "让已有场景保持布局，增加第二、第三个角度", icon: IconPhoto, prompt: "请使用全能场景技能（laotang-scene-reference-zh），基于我指定的已采用场景图补充一个视角。优先读取画布中的实图，保持同一空间布局、物件与世界光源，根据目标机位重算锚点，不要求重做首图。没有实图时说明缺项，不把文字预案当成正式据图提示词。场景图和目标视角：" },
  { label: "落实到画布", description: "将已有提示词与素材整理为可执行节点", icon: IconVector, prompt: "请通过创作总控（workflow）和画布执行（canvas），把我指定的现有提示词与素材落实到当前画布。保留专业稿，复用已有素材，核实真实参考顺序与模型能力；先准备节点和可审阅方案，付费生成须在明确授权范围内执行。本次内容与范围：" },
];
</script>

<style lang="scss">
.agentConversation {
  .messageViewport {
    flex: 1;
    min-height: 0;

    .messageList {
      overflow-anchor: none;
      scrollbar-gutter: stable;
    }

    .messageSpace {
      position: relative;
      width: 100%;
    }

    .scrollBottom {
      position: absolute;
      right: 16px;
      bottom: 12px;
      z-index: 1;
    }

    .welcomeMessage {
      display: flex;
      flex-direction: column;
      gap: 18px;
      padding: 28px 16px 16px;
      color: var(--el-text-color-primary);

      .welcomeHeader {
        display: flex;
        align-items: center;
        gap: 12px;

        .welcomeIcon {
          display: grid;
          place-items: center;
          flex-shrink: 0;
          width: 42px;
          height: 42px;
          border-radius: var(--ui-radius-large);
          background: var(--el-color-primary-light-9);
          color: var(--el-color-primary);

          .welcomeLogo {
            width: 28px;
            height: 28px;
            background: currentColor;
            mask-size: contain;
            mask-position: center;
            mask-repeat: no-repeat;
          }
        }

        .welcomeLabel { margin: 0 0 4px; font-size: 12px; color: var(--el-text-color-secondary); }
        h3 { margin: 0; font-size: 18px; font-weight: 600; line-height: 1.4; }
      }

      .welcomeDescription { margin: 0; font-size: 13px; line-height: 1.7; color: var(--el-text-color-regular); }

      .welcomeSuggestions {
        display: flex;
        flex-direction: column;
        gap: 8px;

        .welcomeSuggestion {
          height: auto;
          margin: 0;
          padding: 12px;
          text-align: left;
          white-space: normal;
          line-height: 1.5;

          > span { display: flex; align-items: center; gap: 12px; width: 100%; min-width: 0; }
          svg { flex-shrink: 0; color: var(--el-text-color-secondary); }
          .suggestionContent {
            display: flex;
            flex: 1;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
            strong { font-size: 13px; font-weight: 500; }
            span { font-size: 12px; color: var(--el-text-color-secondary); }
          }
          .suggestionArrow { color: var(--el-text-color-placeholder); }
        }
      }

      .welcomeHint { margin: 0; font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); }
    }

    .messageRow {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      box-sizing: border-box;
      padding: 0 12px 12px;

      @media (hover: hover) {
        &:not(:hover):not(:has(:focus-visible)) {
          .messageActions {
            opacity: 0;
            pointer-events: none;
          }
        }
      }

      .messageActions {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 4px;

        .el-button {
          margin: 0;

          .tabler-icon {
            flex-shrink: 0;
          }
        }

        .messageAction {
          width: 24px;
          height: 24px;
          padding: 0;
          color: var(--el-text-color-secondary);
        }
      }

      .browserPreview { margin-top: 6px; }

      &.userMessage .messageActions {
        justify-content: flex-end;
      }

      &.editingMessage .t-chat__inner.user .t-chat__content .t-chat__detail {
        width: 100%;
        max-width: 100%;
        padding: 0;
        background: transparent;
      }
    }

    .t-chat__inner {
      margin-bottom: 0;

      .t-chat__content {
        min-width: 0;
        padding-top: 0;

        .t-chat__detail {
          width: 100%;
          max-width: 100%;
          padding: 0;
        }
      }

      &.user .t-chat__content .t-chat__detail {
        width: auto;
        max-width: 80%;
        padding: 6px 10px;
        border-radius: calc(var(--ui-radius) * 1.25);
        background: color-mix(in srgb, var(--el-text-color-secondary) 12%, var(--el-bg-color));
      }
    }

    .messageContent {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      overflow-wrap: anywhere;
      color: var(--el-text-color-primary);

      .processToggle {
        align-self: flex-start;
        margin: 4px 0 0;
        color: var(--el-text-color-secondary);
        white-space: normal;
        height: auto;

        > span { gap: 4px; }
      }

      .messageSection {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }

      .processContent {
        padding-left: 10px;
        border-left: 2px solid var(--el-border-color-lighter);
      }

      .steeringLabel {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        align-self: flex-start;
        color: var(--el-text-color-secondary);
        font-size: 12px;
        line-height: 18px;
      }

      .messageReasoning {
        padding-top: 0;

        .t-collapse-panel__wrapper {
          background: transparent;

          .t-collapse-panel__header {
            padding: 2px 0;
            font-size: 13px;
            line-height: 20px;
          }

          .t-collapse-panel__icon {
            width: 16px;
            height: 20px;
            margin-right: 6px;
            color: var(--el-text-color-secondary);
          }

          .t-collapse-panel__body {
            background: transparent;

            .t-collapse-panel__content {
              padding: 4px 0 4px 22px;
              background: transparent;
              color: var(--el-text-color-secondary);
            }
          }
        }
      }

      .reasoningHeader {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--el-text-color-secondary);

        .thinkingDuration {
          font-variant-numeric: tabular-nums;
        }
      }

      .messageText {
        white-space: pre-wrap;
        font-size: 13px;
        line-height: 1.6;
      }

      .messageError {
        color: var(--el-color-danger);
        font-size: 12px;
      }

      .reportHeader {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--el-text-color-secondary);
        font-size: 12px;
      }

      .messageMarkdown {
        display: block;
        min-width: 0;
        max-width: 100%;
        font-size: 13px;
        line-height: 1.6;
      }
    }
  }
}
</style>
