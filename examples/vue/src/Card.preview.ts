import { preview } from "@nmnmcc/preview-vue";
import { h } from "vue";
import Card from "./Card.vue";

export default preview({
  render: ({ done, emit }) =>
    h(Card, {
      action: "Mark ready",
      body: "This component is mounted by the Vue Sandbox adapter.",
      confirmedAction: "Ready",
      done,
      emit,
      eyebrow: "Vue Sandbox",
      heading: "A small, isolated preview.",
    }),
});
