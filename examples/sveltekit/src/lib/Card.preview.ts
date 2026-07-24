import { preview } from "@nmnmcc/preview-svelte";
import Card from "./Card.svelte";

export default preview({
  component: Card,
  props: ({ done, emit }) => ({
    action: "Mark ready",
    body: "This component runs without SvelteKit route globals.",
    confirmedAction: "Ready",
    done,
    emit,
    eyebrow: "SvelteKit Sandbox",
    heading: "Components stay isolated.",
  }),
});
