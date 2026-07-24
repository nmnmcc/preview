<script lang="ts">
  import type { PreviewDone, PreviewEmit } from "@nmnmcc/preview";
  import { getContext } from "svelte";
  import Card from "./Card.svelte";
  import { PreviewThemeKey, type CardTheme } from "./theme";

  let {
    done,
    emit,
  }: { readonly done: PreviewDone; readonly emit: PreviewEmit } = $props();

  const theme = getContext<CardTheme | undefined>(PreviewThemeKey);
  if (theme === undefined) {
    throw new Error("The preview theme context is missing.");
  }
</script>

<Card
  action="Change state"
  body="The Svelte mount context carries the selected matrix theme into this component."
  confirmedAction="State changed"
  eyebrow="Svelte context"
  heading="Typed props meet mount context."
  {done}
  {emit}
  {theme}
/>
