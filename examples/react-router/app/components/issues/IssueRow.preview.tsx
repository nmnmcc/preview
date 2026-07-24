import { matrix, type PreviewDone, type PreviewEmit } from "@nmnmcc/preview";
import { preview } from "@nmnmcc/preview-react";
import { Table, TableBody } from "~/components/ui/table";
import { TooltipProvider } from "~/components/ui/tooltip";
import {
  InitialIssues,
  type Issue,
  type Locale,
} from "~/features/issues/model";
import { useEffect } from "react";
import "~/app.css";
import { IssueRow } from "./issue-row";

type IssueRowState = "blocked" | "default" | "selected";

const IssuesByState = {
  blocked: InitialIssues[7],
  default: InitialIssues[1],
  selected: InitialIssues[0],
} as const satisfies Readonly<Record<IssueRowState, Issue>>;

const IssueRowSubject = ({
  done,
  emit,
  locale,
  state,
}: {
  readonly done: PreviewDone;
  readonly emit: PreviewEmit;
  readonly locale: Locale;
  readonly state: IssueRowState;
}) => {
  preview: {
    useEffect(() => {
      let active = true;
      let frame = 0;
      void document.fonts.ready.then(() => {
        if (active) {
          frame = requestAnimationFrame(() => {
            void emit("default").then(() => {
              if (active) done();
            });
          });
        }
      });
      return () => {
        active = false;
        cancelAnimationFrame(frame);
      };
    }, [done, emit]);
  }

  return (
    <TooltipProvider>
      <main className="flex min-h-svh items-center bg-muted/30 p-4">
        <div className="w-full overflow-hidden rounded-xl border bg-background shadow-sm">
          <Table className="table-auto">
            <TableBody>
              <IssueRow
                issue={IssuesByState[state]}
                locale={locale}
                selected={state === "selected"}
              />
            </TableBody>
          </Table>
        </div>
      </main>
    </TooltipProvider>
  );
};

export default matrix(
  {
    axes: {
      locale: ["en", "zh"],
      state: ["default", "selected", "blocked"],
    },
  },
  ({ locale, state }) =>
    preview({
      inspection: false,
      render: ({ done, emit }) => (
        <IssueRowSubject
          done={done}
          emit={emit}
          locale={locale}
          state={state}
        />
      ),
      viewports: {
        desktop: { height: 320, width: 960 },
        mobile: { height: 320, width: 390 },
      },
    }),
);
