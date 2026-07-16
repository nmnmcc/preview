import { application } from "@nmnmcc/preview/application";
import { resolve } from "$app/paths";

export default application({
  location: resolve("/items/[id]", { id: "42" }),
});
