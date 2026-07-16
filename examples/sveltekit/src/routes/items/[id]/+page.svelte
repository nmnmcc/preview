<script lang="ts">
  import { ready } from "@nmnmcc/preview/application";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import "$lib/card.css";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  preview: {
    onMount(ready);
  }
</script>

<svelte:head>
  <title>{data.title} Preview example</title>
</svelte:head>

<main
  class="route-stage"
  data-route-id={page.route.id}
  data-url={page.url.pathname}
>
  <article class="route-card">
    <span class="eyebrow">SvelteKit server load</span>
    <h1>{data.title}</h1>
    <p data-item-id={data.id}>
      The Application preview opened this real route and ran its server load.
    </p>
  </article>
</main>
