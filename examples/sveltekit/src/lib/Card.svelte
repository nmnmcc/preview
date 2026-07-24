<script lang="ts">
  import type { PreviewDone, PreviewEmit } from "@nmnmcc/preview";
  import { onMount } from "svelte";
  import "./card.css";

  interface Props {
    readonly action: string;
    readonly body: string;
    readonly confirmedAction: string;
    readonly done?: PreviewDone;
    readonly emit?: PreviewEmit;
    readonly eyebrow: string;
    readonly heading: string;
  }

  let { action, body, confirmedAction, done, emit, eyebrow, heading }: Props =
    $props();

  let confirmed = $state(false);

  preview: {
    onMount(() => {
      if (done === undefined || emit === undefined) return;
      let active = true;
      void emit("default").then(() => {
        if (active) done();
      });
      return () => {
        active = false;
      };
    });
  }
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
