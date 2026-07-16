import type { PreviewReady } from "@nmnmcc/preview";
import { preview } from "@nmnmcc/preview-react";
import { useEffect } from "react";
import Card from "./Card";

const ReadyCard = ({ ready }: { readonly ready: PreviewReady }) => {
  useEffect(() => {
    ready();
  }, [ready]);

  return <Card title="vinext Pages Sandbox" />;
};

export default preview({
  render: ({ ready }) => <ReadyCard ready={ready} />,
});
