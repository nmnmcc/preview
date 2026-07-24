export const IssueStatuses = [
  "in-progress",
  "in-review",
  "todo",
  "backlog",
  "done",
] as const;

export type IssueStatus = (typeof IssueStatuses)[number];

export const IssuePriorities = ["urgent", "high", "medium", "low"] as const;

export type IssuePriority = (typeof IssuePriorities)[number];
export type IssueId = `PRV-${number}`;
export type IssueGroupBy = "status" | "priority";
export type IssueScope = "active" | "all" | "backlog" | "mine";
export type Locale = "en" | "zh";
export type ProjectName =
  "Capture engine" | "Developer experience" | "Infrastructure";
export type PersonId = "alex" | "james" | "kai" | "maya";
export type PersonTone = "blue" | "green" | "purple" | "violet";

export interface Person {
  readonly id: PersonId;
  readonly initials: string;
  readonly name: string;
  readonly tone: PersonTone;
}

export interface Activity {
  readonly actor: PersonId | "agent";
  readonly id: string;
  readonly message: string;
  readonly time: string;
}

export interface Issue {
  readonly activities: ReadonlyArray<Activity>;
  readonly assignee: PersonId;
  readonly blocked: boolean;
  readonly cycle: string;
  readonly description: string;
  readonly id: IssueId;
  readonly labels: ReadonlyArray<string>;
  readonly localizedTitle?: Partial<Record<Locale, string>>;
  readonly priority: IssuePriority;
  readonly project: ProjectName;
  readonly proof: string;
  readonly status: IssueStatus;
  readonly title: string;
  readonly updated: string;
}

export interface IssueFilters {
  readonly project: ProjectName | "all";
  readonly query: string;
  readonly scope: IssueScope;
  readonly status: IssueStatus | "all";
}

export interface IssueGroup {
  readonly issues: ReadonlyArray<Issue>;
  readonly key: IssuePriority | IssueStatus;
  readonly label: string;
}

export interface NewIssueInput {
  readonly assignee: PersonId;
  readonly description: string;
  readonly priority: IssuePriority;
  readonly title: string;
}

export const People = {
  alex: {
    id: "alex",
    initials: "AL",
    name: "Alex Lee",
    tone: "green",
  },
  james: {
    id: "james",
    initials: "JD",
    name: "James Doe",
    tone: "blue",
  },
  kai: {
    id: "kai",
    initials: "KW",
    name: "Kai Wu",
    tone: "purple",
  },
  maya: {
    id: "maya",
    initials: "MC",
    name: "Maya Chen",
    tone: "violet",
  },
} as const satisfies Readonly<Record<PersonId, Person>>;

export const PersonIds = [
  "maya",
  "james",
  "alex",
  "kai",
] as const satisfies ReadonlyArray<PersonId>;

export const Projects = [
  "Capture engine",
  "Developer experience",
  "Infrastructure",
] as const satisfies ReadonlyArray<ProjectName>;

export const StatusLabels = {
  "in-progress": { en: "In progress", zh: "进行中" },
  "in-review": { en: "In review", zh: "审核中" },
  todo: { en: "Todo", zh: "待办" },
  backlog: { en: "Backlog", zh: "需求池" },
  done: { en: "Done", zh: "已完成" },
} as const satisfies Readonly<Record<IssueStatus, Record<Locale, string>>>;

export const PriorityLabels = {
  urgent: { en: "Urgent", zh: "紧急" },
  high: { en: "High", zh: "高" },
  medium: { en: "Medium", zh: "中" },
  low: { en: "Low", zh: "低" },
} as const satisfies Readonly<Record<IssuePriority, Record<Locale, string>>>;

const SharedProof =
  "app/routes/.preview/Issues.preview.ts/default/viewport=desktop.inspect/README.md";

export const InitialIssues = [
  {
    activities: [
      {
        actor: "maya",
        id: "activity-142-status",
        message: "Maya moved this to In progress",
        time: "2 min ago",
      },
      {
        actor: "agent",
        id: "activity-142-proof",
        message: "Agent attached layout inspection evidence",
        time: "2 min ago",
      },
    ],
    assignee: "maya",
    blocked: false,
    cycle: "Cycle 24",
    description:
      "The application route should settle on the same pixels after its loader resolves.",
    id: "PRV-142",
    labels: ["Agent", "Application"],
    localizedTitle: {
      zh: "在加载器刷新后保持路由预览稳定",
    },
    priority: "high",
    project: "Capture engine",
    proof: SharedProof,
    status: "in-progress",
    title: "Keep route previews stable after loader refresh",
    updated: "2m",
  },
  {
    activities: [],
    assignee: "james",
    blocked: false,
    cycle: "Cycle 24",
    description:
      "Review the narrow layout before a visual change reaches the main branch.",
    id: "PRV-139",
    labels: ["Mobile", "Review"],
    localizedTitle: {
      zh: "在审核前检查移动端产物",
    },
    priority: "high",
    project: "Capture engine",
    proof:
      "app/routes/.preview/Issues.preview.ts/default/viewport=mobile.inspect/overview.png",
    status: "in-progress",
    title: "Inspect mobile artifacts before review",
    updated: "8m",
  },
  {
    activities: [],
    assignee: "alex",
    blocked: false,
    cycle: "Cycle 24",
    description: "Keep stable visual history for release and CI review.",
    id: "PRV-136",
    labels: ["CI", "Artifacts"],
    priority: "medium",
    project: "Infrastructure",
    proof: SharedProof,
    status: "in-progress",
    title: "Keep versioned screenshots in CI",
    updated: "14m",
  },
  {
    activities: [],
    assignee: "kai",
    blocked: false,
    cycle: "Cycle 24",
    description: "A full run should remove output for deleted definitions.",
    id: "PRV-131",
    labels: ["Artifacts"],
    priority: "medium",
    project: "Capture engine",
    proof: SharedProof,
    status: "todo",
    title: "Remove stale capture output",
    updated: "22m",
  },
  {
    activities: [],
    assignee: "maya",
    blocked: false,
    cycle: "Cycle 24",
    description: "Explain how final pixels produce each emitted state.",
    id: "PRV-128",
    labels: ["Docs", "Agent"],
    priority: "low",
    project: "Developer experience",
    proof: SharedProof,
    status: "todo",
    title: "Document the capture lifecycle",
    updated: "31m",
  },
  {
    activities: [],
    assignee: "james",
    blocked: false,
    cycle: "Cycle 24",
    description:
      "Make an empty result useful after filters remove every issue.",
    id: "PRV-124",
    labels: ["UX", "States"],
    priority: "low",
    project: "Developer experience",
    proof: SharedProof,
    status: "in-review",
    title: "Cover the empty issue state",
    updated: "46m",
  },
  {
    activities: [],
    assignee: "alex",
    blocked: false,
    cycle: "Cycle 24",
    description: "Give agents a clear path after a failed capture.",
    id: "PRV-118",
    labels: ["Docs"],
    priority: "low",
    project: "Developer experience",
    proof: SharedProof,
    status: "backlog",
    title: "Add retry guidance to docs",
    updated: "1h",
  },
  {
    activities: [],
    assignee: "kai",
    blocked: true,
    cycle: "Cycle 25",
    description: "Find the event that can replace a guessed loader timeout.",
    id: "PRV-101",
    labels: ["Reliability", "Blocked"],
    localizedTitle: {
      zh: "调查加载器超时中的不稳定问题",
    },
    priority: "urgent",
    project: "Infrastructure",
    proof: SharedProof,
    status: "backlog",
    title: "Investigate flake in loader timeout",
    updated: "2h",
  },
  {
    activities: [],
    assignee: "maya",
    blocked: false,
    cycle: "Cycle 23",
    description: "The first complete agent workflow is ready for reuse.",
    id: "PRV-96",
    labels: ["Agent", "Release"],
    priority: "medium",
    project: "Capture engine",
    proof: SharedProof,
    status: "done",
    title: "Ship the focused agent preview loop",
    updated: "1d",
  },
] as const satisfies ReadonlyArray<Issue>;

export const DefaultIssue = InitialIssues[0];

export const getPerson = (id: PersonId): Person => People[id];

export const getIssueTitle = (issue: Issue, locale: Locale): string =>
  issue.localizedTitle?.[locale] ?? issue.title;

export const findInitialIssue = (
  value: string | undefined,
): Issue | undefined => InitialIssues.find(({ id }) => id === value);

export const hasInitialIssue = (id: IssueId): boolean =>
  InitialIssues.some((issue) => issue.id === id);

export const filterIssues = (
  issues: ReadonlyArray<Issue>,
  filters: IssueFilters,
): ReadonlyArray<Issue> => {
  const query = filters.query.trim().toLocaleLowerCase("en");

  return issues.filter((issue) => {
    const matchesScope =
      filters.scope === "all" ||
      (filters.scope === "active" && issue.status !== "done") ||
      (filters.scope === "backlog" && issue.status === "backlog") ||
      (filters.scope === "mine" &&
        issue.assignee === "maya" &&
        issue.status !== "done");
    const matchesStatus =
      filters.status === "all" || issue.status === filters.status;
    const matchesProject =
      filters.project === "all" || issue.project === filters.project;
    const searchable = [issue.id, issue.title, issue.project, ...issue.labels]
      .join(" ")
      .toLocaleLowerCase("en");
    const matchesQuery = query.length === 0 || searchable.includes(query);

    return matchesScope && matchesStatus && matchesProject && matchesQuery;
  });
};

export const groupIssues = (
  issues: ReadonlyArray<Issue>,
  groupBy: IssueGroupBy,
  locale: Locale,
): ReadonlyArray<IssueGroup> => {
  if (groupBy === "status") {
    return IssueStatuses.flatMap((key) => {
      const grouped = issues.filter((issue) => issue.status === key);
      return grouped.length === 0
        ? []
        : [{ issues: grouped, key, label: StatusLabels[key][locale] }];
    });
  }

  return IssuePriorities.flatMap((key) => {
    const grouped = issues.filter((issue) => issue.priority === key);
    return grouped.length === 0
      ? []
      : [{ issues: grouped, key, label: PriorityLabels[key][locale] }];
  });
};

export const updateIssueStatus = (
  issues: ReadonlyArray<Issue>,
  id: IssueId,
  status: IssueStatus,
): ReadonlyArray<Issue> =>
  issues.map((issue) => (issue.id === id ? { ...issue, status } : issue));

export const addIssueActivity = (
  issues: ReadonlyArray<Issue>,
  id: IssueId,
  activity: Activity,
): ReadonlyArray<Issue> =>
  issues.map((issue) =>
    issue.id === id
      ? { ...issue, activities: [...issue.activities, activity] }
      : issue,
  );

export const createLocalIssue = (
  sequence: number,
  input: NewIssueInput,
): Issue => ({
  activities: [
    {
      actor: "agent",
      id: `activity-local-${sequence}`,
      message: "Agent created this local demo issue",
      time: "just now",
    },
  ],
  assignee: input.assignee,
  blocked: false,
  cycle: "Cycle 24",
  description:
    input.description.trim() ||
    "This issue was created in the deterministic local demo.",
  id: `PRV-${sequence}`,
  labels: ["Local demo"],
  priority: input.priority,
  project: "Capture engine",
  proof: SharedProof,
  status: "todo",
  title: input.title.trim(),
  updated: "now",
});
