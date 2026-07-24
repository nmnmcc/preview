import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("issues/:issueId", "routes/issues.tsx"),
] satisfies RouteConfig;
