import { preview } from "@nmnmcc/preview-svelte";
import Card from "./Card.svelte";

export default preview({
  component: Card,
  props: ({ ready }) => ({
    action: "Mark ready",
    body: "This component is mounted by the Svelte Sandbox adapter.",
    confirmedAction: "Ready",
    eyebrow: "Svelte Sandbox",
    heading: "A small, isolated preview.",
    ready,
  }),
});
