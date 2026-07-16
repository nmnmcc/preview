import { preview } from "@nmnmcc/preview-react";
import { Card } from "./Card";

export default preview({
  render: ({ ready }) => (
    <Card
      action="Mark ready"
      body="This component is isolated from the React Router application."
      confirmedAction="Ready"
      eyebrow="React Router Sandbox"
      heading="Components stay small."
      ready={ready}
    />
  ),
});
