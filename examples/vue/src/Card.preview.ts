import { preview } from "@nmnmcc/preview-vue";
import { h } from "vue";
import Card from "./Card.vue";

export default preview({
  render: ({ ready }) =>
    h(Card, {
      action: "Mark ready",
      body: "This component is mounted by the Vue Sandbox adapter.",
      confirmedAction: "Ready",
      eyebrow: "Vue Sandbox",
      heading: "A small, isolated preview.",
      ready,
    }),
});
