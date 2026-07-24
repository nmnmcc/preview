"use client";

import { done, emit } from "@nmnmcc/preview/application";
import { use, useEffect } from "react";

const ProjectPage = ({ params }: PageProps<"/projects/[projectId]">) => {
  const { projectId } = use(params);

  preview: {
    useEffect(() => {
      void emit("default").then(done);
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
