import { preview } from "@nmnmcc/preview-svelte";
import Card from "./Card.svelte";

export default preview({
  component: Card,
  props: ({ done, emit }) => ({
    action: "Mark ready",
    body: "This component is mounted by the Svelte Sandbox adapter.",
    confirmedAction: "Ready",
    done,
    emit,
    eyebrow: "Svelte Sandbox",
    heading: "A small, isolated preview.",
  }),
});
