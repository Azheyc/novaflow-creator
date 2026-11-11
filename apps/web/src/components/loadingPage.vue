<template>
  <teleport to="body">
    <div v-if="visible" class="loadingPage" role="status" aria-label="正在加载项目">
      <div class="logoWrap" :class="{ drawn, filling }" aria-hidden="true">
        <div class="logoOutline" @animationend="finishDrawing">
          <img ref="logoElement" class="logoPulse" :src="logoUrl" alt="" />
        </div>
        <img class="logoFill" :src="logoUrl" alt="" @animationend="finishFilling" />
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import logoUrl from "@toonflow/assets/logo.svg";

const props = defineProps<{ active: boolean }>();
const visible = defineModel<boolean>("visible", { default: false });
const drawn = defineModel<boolean>("drawn", { default: false });
const logoElement = ref<HTMLElement>();
const filling = ref(false);
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const reducedMotion = ref(motionPreference.matches);

function updateMotionPreference(event: MediaQueryListEvent) {
  reducedMotion.value = event.matches;
}
motionPreference.addEventListener("change", updateMotionPreference);
onBeforeUnmount(() => motionPreference.removeEventListener("change", updateMotionPreference));

watch([() => props.active, reducedMotion], ([active, reducedMotion]) => {
  if (active) {
    if (!visible.value) {
      drawn.value = false;
      visible.value = true;
    }
    filling.value = false;
  }
  if (reducedMotion) {
    drawn.value = true;
    if (!active) visible.value = false;
  } else if (!active && drawn.value && visible.value) {
    filling.value = true;
  }
}, { immediate: true });

function finishDrawing(event: AnimationEvent) {
  if (event.target !== logoElement.value) return;
  drawn.value = true;
  if (!props.active) filling.value = true;
}

function finishFilling() {
  if (!props.active) visible.value = false;
}
</script>

<style lang="scss" scoped>
.loadingPage {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: var(--el-bg-color);

  .logoWrap {
    position: absolute;
    top: 50dvh;
    left: 50vw;
    width: 96px;
    aspect-ratio: 1;
    transform: translate(-50%, -50%);

    .dark & { filter: invert(1); }

    .logoOutline {
      width: 100%;
      line-height: 0;
      will-change: opacity;

      .logoPulse { display: block; width: 100%; height: auto; animation: logoAppear 0.65s ease both; }
    }

    .logoFill {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      opacity: 0;
      will-change: opacity;
    }

    &.drawn .logoOutline :deep(path) { animation: none; stroke-dashoffset: 0; }
    &.drawn .logoPulse { animation: logoPulse 0.9s ease-in-out infinite; will-change: opacity; }
    &.filling {
      .logoOutline { animation: logoOutlineOut 0.25s ease both; }
      .logoPulse { animation-play-state: paused; }
      .logoFill { animation: logoFill 0.25s ease both; }
    }

    @media (prefers-reduced-motion: reduce) {
      .logoOutline { opacity: 0; }
      .logoOutline :deep(path) { animation: none; }
      &.drawn .logoPulse { animation: none; }
      .logoFill { opacity: 1; }
    }
  }
}

@keyframes logoAppear {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes logoFill {
  0% { opacity: 0; }
  70%, 100% { opacity: 1; }
}

@keyframes logoOutlineOut {
  0% { opacity: 1; }
  70%, 100% { opacity: 0; }
}

@keyframes logoPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
</style>
