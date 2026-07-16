import { preview } from "@nmnmcc/preview-svelte";
import Card from "./Card.svelte";

export default preview({
  component: Card,
  props: ({ ready }) => ({
    action: "Mark ready",
    body: "This component runs without SvelteKit route globals.",
    confirmedAction: "Ready",
    eyebrow: "SvelteKit Sandbox",
    heading: "Components stay isolated.",
    ready,
  }),
});
