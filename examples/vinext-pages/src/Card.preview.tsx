import type { PreviewDone, PreviewEmit } from "@nmnmcc/preview";
import { preview } from "@nmnmcc/preview-react";
import { useEffect } from "react";
import Card from "./Card";

const CapturedCard = ({
  done,
  emit,
}: {
  readonly done: PreviewDone;
  readonly emit: PreviewEmit;
}) => {
  useEffect(() => {
    void emit("default").then(done);
  }, [done, emit]);

  return <Card title="vinext Pages Sandbox" />;
};

export default preview({
  render: ({ done, emit }) => <CapturedCard done={done} emit={emit} />,
});
