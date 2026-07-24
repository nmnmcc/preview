import { done, emit } from "@nmnmcc/preview/application";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useEffect } from "react";

interface ProjectViewModel {
  readonly id: string;
  readonly name: string;
}

export const getServerSideProps: GetServerSideProps<
  ProjectViewModel,
  { readonly projectId: string }
> = async ({ params }) => {
  if (params === undefined) return { notFound: true };

  return {
    props: {
      id: params.projectId,
      name: `Project ${params.projectId}`,
    },
  };
};

const ProjectPage = ({
  id,
  name,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  preview: {
    useEffect(() => {
      void emit("default").then(done);
    }, []);
  }

  return (
    <main data-project-id={id}>
      <h1>{name}</h1>
      <p>This text came from vinext Pages Router server props.</p>
    </main>
  );
};

export default ProjectPage;
