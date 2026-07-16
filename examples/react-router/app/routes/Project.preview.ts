import { application } from "@nmnmcc/preview/application";
import { href } from "react-router";

export default application({
  location: href("/projects/:projectId", { projectId: "42" }),
});
