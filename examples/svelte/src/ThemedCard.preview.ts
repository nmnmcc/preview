import { matrix } from "@nmnmcc/preview";
import { preview } from "@nmnmcc/preview-svelte";
import { PreviewThemeKey } from "./theme";
import ThemedCard from "./ThemedCard.svelte";

export default matrix(
  {
    axes: {
      theme: ["light", "dark"],
    },
  },
  ({ theme }) =>
    preview({
      component: ThemedCard,
      context: new Map([[PreviewThemeKey, theme]]),
      props: ({ done, emit }) => ({ done, emit }),
    }),
);
