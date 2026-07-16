import { preview } from "@nmnmcc/preview-react";
import { Card } from "./Card";

export default preview({
  render: ({ ready }) => (
    <Card
      action="Mark ready"
      body="This component is mounted by the React Sandbox adapter."
      confirmedAction="Ready"
      eyebrow="React Sandbox"
      heading="A small, isolated preview."
      ready={ready}
    />
  ),
});
