import { PreviewMark } from "~/components/preview-mark";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Textarea } from "~/components/ui/textarea";
import {
  getIssueTitle,
  getPerson,
  IssueStatuses,
  StatusLabels,
  type Activity,
  type Issue,
  type IssueStatus,
} from "~/features/issues/model";
import { cn } from "~/lib/utils";
import {
  CheckIcon,
  ClipboardIcon,
  Clock3Icon,
  Code2Icon,
  MessageSquareIcon,
  SendIcon,
  SparklesIcon,
  TagIcon,
} from "lucide-react";
import { useState } from "react";
import { PersonAvatar, Priority, StatusBadge } from "./issue-metadata";

const StatusItems = IssueStatuses.map((value) => ({
  label: StatusLabels[value].en,
  value,
}));

const ActivityAvatar = ({ activity }: { readonly activity: Activity }) =>
  activity.actor === "agent" ? (
    <PreviewMark className="size-6 text-primary" />
  ) : (
    <PersonAvatar id={activity.actor} />
  );

export const IssueDetail = ({
  className,
  issue,
  onAddComment,
  onStatusChange,
}: {
  readonly className?: string;
  readonly issue: Issue;
  readonly onAddComment: (message: string) => void;
  readonly onStatusChange: (status: IssueStatus) => void;
}) => {
  const [comment, setComment] = useState("");
  const [copied, setCopied] = useState(false);

  const copyProof = async () => {
    await navigator.clipboard?.writeText(issue.proof);
    setCopied(true);
  };

  return (
    <ScrollArea className={cn("h-full", className)}>
      <div className="min-w-0 px-5 pt-5 pb-10 lg:px-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{issue.id}</span>
            <span aria-hidden="true">·</span>
            <span>{issue.updated} ago</span>
          </div>
          <Select
            items={StatusItems}
            onValueChange={(value) => {
              if (value) onStatusChange(value);
            }}
            value={issue.status}
          >
            <SelectTrigger aria-label="Change issue status" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" alignItemWithTrigger={false}>
              <SelectGroup>
                {IssueStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    <StatusBadge status={status} />
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <h2 className="text-pretty text-xl leading-7 font-semibold tracking-[-0.02em] lg:text-[1.35rem]">
          {getIssueTitle(issue, "en")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {issue.description}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-muted/25 p-3.5 text-sm">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Assignee</div>
            <PersonAvatar id={issue.assignee} showName />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Priority</div>
            <Priority priority={issue.priority} />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Project</div>
            <div className="truncate font-medium">{issue.project}</div>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Cycle</div>
            <div className="flex items-center gap-1.5 font-medium">
              <Clock3Icon aria-hidden="true" className="size-3.5" />
              {issue.cycle}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {issue.labels.map((label) => (
            <Badge key={label} variant="outline">
              <TagIcon data-icon="inline-start" />
              {label}
            </Badge>
          ))}
        </div>

        <Separator className="my-6" />

        <section aria-labelledby="proof-heading" data-preview-region="proof">
          <div className="mb-2.5 flex items-center justify-between">
            <div>
              <h3
                className="flex items-center gap-2 text-sm font-semibold"
                id="proof-heading"
              >
                <SparklesIcon
                  aria-hidden="true"
                  className="size-4 text-primary"
                />
                Preview proof
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                9 responsive checks · Markdown, JSON, and PNG evidence.
              </p>
            </div>
            <Button
              onClick={() => void copyProof()}
              size="xs"
              variant="outline"
            >
              {copied ? (
                <CheckIcon data-icon="inline-start" />
              ) : (
                <ClipboardIcon data-icon="inline-start" />
              )}
              {copied ? "Copied" : "Copy path"}
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border bg-[#15141a] text-white shadow-sm">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
              <span className="size-2 rounded-full bg-[#ff6b66]" />
              <span className="size-2 rounded-full bg-[#f5bf4f]" />
              <span className="size-2 rounded-full bg-[#61c454]" />
              <span className="ml-auto text-[10px] text-white/45">
                inspection bundle
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2 px-3 py-3 font-mono text-[11px] leading-5 text-white/80">
              <Code2Icon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-violet-300"
              />
              <code className="min-w-0 flex-1 truncate" title={issue.proof}>
                {issue.proof}
              </code>
            </div>
          </div>
        </section>

        <Separator className="my-6" />

        <section aria-labelledby="activity-heading">
          <h3
            className="flex items-center gap-2 text-sm font-semibold"
            id="activity-heading"
          >
            <MessageSquareIcon
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            Activity
          </h3>
          <div className="mt-4 space-y-4">
            {issue.activities.length === 0 ? (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                No activity yet. Add the first note below.
              </p>
            ) : (
              issue.activities.map((activity) => (
                <div className="flex gap-2.5" key={activity.id}>
                  <ActivityAvatar activity={activity} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-5 text-foreground">
                      {activity.message}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {activity.actor === "agent"
                        ? "Preview Agent"
                        : getPerson(activity.actor).name}{" "}
                      · {activity.time}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          <form
            className="mt-5 rounded-xl border bg-background p-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20"
            onSubmit={(event) => {
              event.preventDefault();
              const value = comment.trim();
              if (!value) return;
              onAddComment(value);
              setComment("");
            }}
          >
            <Textarea
              aria-label="Add a comment"
              className="min-h-16 resize-none border-0 bg-transparent px-1.5 shadow-none focus-visible:ring-0"
              id="issue-comment"
              name="comment"
              onChange={(event) => setComment(event.currentTarget.value)}
              placeholder="Leave a note for the next agent…"
              value={comment}
            />
            <div className="flex justify-end">
              <Button disabled={!comment.trim()} size="xs" type="submit">
                <SendIcon data-icon="inline-start" />
                Comment
              </Button>
            </div>
          </form>
        </section>
      </div>
    </ScrollArea>
  );
};
