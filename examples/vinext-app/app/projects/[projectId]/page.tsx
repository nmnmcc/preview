"use client";

import { ready } from "@nmnmcc/preview/application";
import { use, useEffect } from "react";

const ProjectPage = ({
  params,
}: PageProps<"/projects/[projectId]">) => {
  const { projectId } = use(params);

  preview: {
    useEffect(() => {
      ready();
    }, []);
  }

  return (
    <main data-project-id={projectId}>
      <h1>Project {projectId}</h1>
      <p>This text came from a vinext App Router page.</p>
    </main>
  );
};

export default ProjectPage;
