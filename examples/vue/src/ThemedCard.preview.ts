import { matrix } from "@nmnmcc/preview";
import { h } from "vue";
import { preview } from "./preview";
import ThemedCard from "./ThemedCard.vue";

export default matrix(
  {
    axes: {
      theme: ["light", "dark"],
    },
  },
  ({ theme }) =>
    preview({
      theme,
      render: ({ done, emit }) => h(ThemedCard, { done, emit }),
    }),
);
