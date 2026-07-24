import { Badge } from "~/components/ui/badge";
import { TableCell, TableRow } from "~/components/ui/table";
import {
  getIssueTitle,
  type Issue,
  type Locale,
} from "~/features/issues/model";
import { cn } from "~/lib/utils";
import { BanIcon } from "lucide-react";
import { PersonAvatar, Priority, StatusBadge } from "./issue-metadata";

export type IssueRowDensity = "comfortable" | "compact";

export interface IssueRowProps {
  readonly density?: IssueRowDensity;
  readonly issue: Issue;
  readonly locale?: Locale;
  readonly onSelect?: (issue: Issue) => void;
  readonly selected?: boolean;
}

export const IssueRow = ({
  density = "comfortable",
  issue,
  locale = "en",
  onSelect,
  selected = false,
}: IssueRowProps) => {
  const select = () => onSelect?.(issue);

  return (
    <TableRow
      aria-label={`Open ${issue.id}: ${getIssueTitle(issue, locale)}`}
      aria-selected={selected}
      className={cn(
        "group cursor-pointer border-border/80 outline-none focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45",
        selected &&
          "bg-accent/75 shadow-[inset_3px_0_0_var(--primary)] hover:bg-accent/85",
        issue.blocked && "bg-destructive/[0.025]",
        density === "compact" ? "h-14 md:h-11" : "h-[4.25rem] md:h-[3.25rem]",
      )}
      data-issue-id={issue.id}
      data-state={selected ? "selected" : undefined}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      }}
      tabIndex={0}
    >
      <TableCell className="hidden w-[5.25rem] pl-5 font-mono text-xs text-muted-foreground md:table-cell">
        {issue.id}
      </TableCell>
      <TableCell className="min-w-0 py-2 pr-2 pl-4 whitespace-normal md:pl-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="line-clamp-2 whitespace-normal font-medium text-foreground md:block md:truncate md:whitespace-nowrap">
                {getIssueTitle(issue, locale)}
              </span>
              {issue.blocked ? (
                <>
                  <BanIcon
                    aria-label={locale === "zh" ? "受阻" : "Blocked"}
                    className="size-3.5 shrink-0 text-destructive sm:hidden"
                  />
                  <Badge
                    className="hidden sm:inline-flex"
                    variant="destructive"
                  >
                    <BanIcon data-icon="inline-start" />
                    {locale === "zh" ? "受阻" : "Blocked"}
                  </Badge>
                </>
              ) : null}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground md:hidden">
              <span className="font-mono">{issue.id}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{issue.project}</span>
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="w-[7.25rem] px-2 text-right md:text-left">
        <StatusBadge locale={locale} status={issue.status} />
      </TableCell>
      <TableCell className="hidden w-24 md:table-cell">
        <Priority locale={locale} priority={issue.priority} />
      </TableCell>
      <TableCell className="hidden w-16 md:table-cell">
        <PersonAvatar id={issue.assignee} />
      </TableCell>
      <TableCell className="hidden w-36 max-w-36 truncate text-xs text-muted-foreground lg:table-cell">
        {issue.project}
      </TableCell>
      <TableCell className="hidden w-14 pr-5 text-right text-xs text-muted-foreground md:table-cell">
        {issue.updated}
      </TableCell>
    </TableRow>
  );
};
