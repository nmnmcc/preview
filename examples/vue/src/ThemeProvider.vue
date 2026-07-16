<script setup lang="ts">
import { provide, toRef } from "vue";
import { PreviewThemeKey, type CardTheme } from "./theme";

const props = defineProps<{ readonly theme: CardTheme }>();

provide(PreviewThemeKey, toRef(props, "theme"));
</script>

<template>
  <slot />
</template>
