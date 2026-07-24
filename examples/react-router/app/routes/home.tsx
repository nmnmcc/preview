import { href, redirect } from "react-router";

export const loader = () =>
  redirect(href("/issues/:issueId", { issueId: "PRV-142" }));

const HomeRoute = () => null;

export default HomeRoute;
