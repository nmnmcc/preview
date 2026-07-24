<script setup lang="ts">
import type { PreviewDone, PreviewEmit } from "@nmnmcc/preview";
import { inject } from "vue";
import Card from "./Card.vue";
import { PreviewThemeKey } from "./theme";

defineProps<{ readonly done: PreviewDone; readonly emit: PreviewEmit }>();

const theme = inject(PreviewThemeKey);
if (theme === undefined) {
  throw new Error("The preview theme provider is missing.");
}
</script>

<template>
  <Card
    action="Change state"
    body="Vue provide and inject carry the selected matrix theme into this component."
    confirmed-action="State changed"
    eyebrow="Vue provide/inject"
    heading="A provider for every variant."
    :done="done"
    :emit="emit"
    :theme="theme"
  />
</template>
