import { ready } from "@nmnmcc/preview/application";
import { useEffect } from "react";
import type { Route } from "./+types/project";

export const loader = ({ params }: Route.LoaderArgs) => ({
  id: params.projectId,
  name: `Project ${params.projectId}`,
});

const ProjectRoute = ({ loaderData }: Route.ComponentProps) => {
  preview: {
    useEffect(() => {
      ready();
    }, []);
  }

  return (
    <main className="route-stage" data-project-id={loaderData.id}>
      <article className="route-card">
        <span className="eyebrow">React Router loader</span>
        <h1>{loaderData.name}</h1>
        <p>
          The Application preview opened this real route and ran its loader.
        </p>
      </article>
    </main>
  );
};

export default ProjectRoute;
