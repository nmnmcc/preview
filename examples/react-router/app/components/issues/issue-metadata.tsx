import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import {
  getPerson,
  PriorityLabels,
  StatusLabels,
  type IssuePriority,
  type IssueStatus,
  type Locale,
  type PersonId,
} from "~/features/issues/model";
import { cn } from "~/lib/utils";
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleDotDashedIcon,
  CircleDotIcon,
  EyeIcon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

type StatusIcon = ComponentType<SVGProps<SVGSVGElement>>;

const StatusIcons = {
  backlog: CircleDashedIcon,
  done: CheckCircle2Icon,
  "in-progress": CircleDotDashedIcon,
  "in-review": EyeIcon,
  todo: CircleDotIcon,
} as const satisfies Readonly<Record<IssueStatus, StatusIcon>>;

const StatusVariants = {
  backlog: "backlog",
  done: "done",
  "in-progress": "inProgress",
  "in-review": "inReview",
  todo: "todo",
} as const;

const PriorityColors = {
  high: "bg-priority-high",
  low: "bg-priority-low",
  medium: "bg-priority-medium",
  urgent: "bg-priority-urgent",
} as const satisfies Readonly<Record<IssuePriority, string>>;

const AvatarColors = {
  blue: "bg-avatar-blue text-avatar-blue-foreground",
  green: "bg-avatar-green text-avatar-green-foreground",
  purple: "bg-avatar-purple text-avatar-purple-foreground",
  violet: "bg-avatar-violet text-avatar-violet-foreground",
} as const;

export const StatusBadge = ({
  locale = "en",
  status,
}: {
  readonly locale?: Locale;
  readonly status: IssueStatus;
}) => {
  const Icon = StatusIcons[status];

  return (
    <Badge variant={StatusVariants[status]}>
      <Icon data-icon="inline-start" />
      {StatusLabels[status][locale]}
    </Badge>
  );
};

export const Priority = ({
  locale = "en",
  priority,
  showLabel = true,
}: {
  readonly locale?: Locale;
  readonly priority: IssuePriority;
  readonly showLabel?: boolean;
}) => (
  <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
    <span
      aria-hidden="true"
      className={cn("size-2 rounded-full", PriorityColors[priority])}
    />
    {showLabel ? PriorityLabels[priority][locale] : null}
    <span className="sr-only">
      {!showLabel ? PriorityLabels[priority][locale] : null}
    </span>
  </span>
);

export const PersonAvatar = ({
  id,
  showName = false,
  size = "sm",
}: {
  readonly id: PersonId;
  readonly showName?: boolean;
  readonly size?: "default" | "sm" | "lg";
}) => {
  const person = getPerson(id);

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar size={size}>
        <AvatarFallback className={AvatarColors[person.tone]}>
          {person.initials}
        </AvatarFallback>
      </Avatar>
      {showName ? (
        <span className="truncate text-sm text-foreground">{person.name}</span>
      ) : (
        <span className="sr-only">{person.name}</span>
      )}
    </span>
  );
};
