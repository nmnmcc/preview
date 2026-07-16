<script setup lang="ts">
import type { PreviewReady } from "@nmnmcc/preview";
import { nextTick, onMounted, ref } from "vue";
import type { CardTheme } from "./theme";

interface Props {
  readonly action: string;
  readonly body: string;
  readonly confirmedAction: string;
  readonly eyebrow: string;
  readonly heading: string;
  readonly ready?: PreviewReady;
  readonly theme?: CardTheme;
}

const {
  action,
  body,
  confirmedAction,
  eyebrow,
  heading,
  ready,
  theme = "light",
} = defineProps<Props>();

const confirmed = ref(false);

onMounted(async () => {
  await nextTick();
  ready?.();
});
</script>

<template>
  <main class="stage" :data-theme="theme">
    <article class="card">
      <span class="eyebrow">{{ eyebrow }}</span>
      <h1>{{ heading }}</h1>
      <p>{{ body }}</p>
      <button
        type="button"
        :aria-pressed="confirmed"
        @click="confirmed = !confirmed"
      >
        {{ confirmed ? confirmedAction : action }}
      </button>
    </article>
  </main>
</template>

<style src="./card.css"></style>
