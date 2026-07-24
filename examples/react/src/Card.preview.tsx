import { preview } from "@nmnmcc/preview-react";
import { Card } from "./Card";

export default preview({
  render: ({ done, emit }) => (
    <Card
      action="Mark ready"
      body="This component is mounted by the React Sandbox adapter."
      confirmedAction="Ready"
      done={done}
      emit={emit}
      eyebrow="React Sandbox"
      heading="A small, isolated preview."
    />
  ),
});
