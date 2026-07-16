<script lang="ts">
  import type { PreviewReady } from "@nmnmcc/preview";
  import { onMount } from "svelte";
  import "./card.css";

  interface Props {
    readonly action: string;
    readonly body: string;
    readonly confirmedAction: string;
    readonly eyebrow: string;
    readonly heading: string;
    readonly ready?: PreviewReady;
  }

  let {
    action,
    body,
    confirmedAction,
    eyebrow,
    heading,
    ready,
  }: Props = $props();

  let confirmed = $state(false);

  onMount(() => ready?.());
</script>

<main class="stage" data-theme="light">
  <article class="card">
    <span class="eyebrow">{eyebrow}</span>
    <h1>{heading}</h1>
    <p>{body}</p>
    <button
      aria-pressed={confirmed}
      onclick={() => (confirmed = !confirmed)}
      type="button"
    >
      {confirmed ? confirmedAction : action}
    </button>
  </article>
</main>
