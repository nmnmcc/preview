import { matrix } from "@nmnmcc/preview";
import { preview } from "@nmnmcc/preview-svelte";
import ThemedCard from "./ThemedCard.svelte";
import { PreviewThemeKey } from "./theme";

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
      props: ({ ready }) => ({ ready }),
    }),
);
