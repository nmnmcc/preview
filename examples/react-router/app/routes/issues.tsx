import { done, emit } from "@nmnmcc/preview/application";
import { AppSidebar } from "~/components/app-sidebar";
import { IssueDetail } from "~/components/issues/issue-detail";
import { IssueRow, type IssueRowDensity } from "~/components/issues/issue-row";
import { NewIssueDialog } from "~/components/issues/new-issue-dialog";
import { PreviewMark } from "~/components/preview-mark";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  addIssueActivity,
  createLocalIssue,
  DefaultIssue,
  filterIssues,
  findInitialIssue,
  getIssueTitle,
  groupIssues,
  InitialIssues,
  IssueStatuses,
  StatusLabels,
  updateIssueStatus,
  type Issue,
  type IssueFilters,
  type IssueGroupBy,
  type IssueId,
  type IssueStatus,
  type NewIssueInput,
} from "~/features/issues/model";
import { useViewportMode } from "~/hooks/use-mobile";
import {
  ArrowDownUpIcon,
  CheckIcon,
  ChevronDownIcon,
  FilterIcon,
  ListFilterIcon,
  MenuIcon,
  Rows3Icon,
  SearchIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  href,
  isRouteErrorResponse,
  useNavigate,
  useRouteError,
} from "react-router";
import type { Route } from "./+types/issues";

const DefaultFilters: IssueFilters = {
  project: "all",
  query: "",
  scope: "active",
  status: "all",
};

const ScopeTitles = {
  active: "Active issues",
  all: "All issues",
  backlog: "Backlog",
  mine: "My issues",
} as const;

export const loader = ({ params }: Route.LoaderArgs) => {
  const issue = findInitialIssue(params.issueId);
  if (!issue) {
    throw new Response("Issue not found", { status: 404 });
  }
  return { issueId: issue.id };
};

const IssuesRoute = ({ loaderData }: Route.ComponentProps) => {
  const navigate = useNavigate();
  const viewportMode = useViewportMode();
  const [issues, setIssues] = useState<ReadonlyArray<Issue>>(InitialIssues);
  const [filters, setFilters] = useState<IssueFilters>(DefaultFilters);
  const [groupBy, setGroupBy] = useState<IssueGroupBy>("status");
  const [density, setDensity] = useState<IssueRowDensity>("comfortable");
  const [localSelection, setLocalSelection] = useState<IssueId>();
  const [nextSequence, setNextSequence] = useState(143);
  const [detailOpen, setDetailOpen] = useState(true);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const selectedId = localSelection ?? loaderData.issueId;
  const selectedIssue =
    issues.find((issue) => issue.id === selectedId) ?? DefaultIssue;
  const visibleIssues = useMemo(
    () => filterIssues(issues, filters),
    [filters, issues],
  );
  const issueGroups = useMemo(
    () => groupIssues(visibleIssues, groupBy, "en"),
    [groupBy, visibleIssues],
  );

  preview: {
    useEffect(() => {
      if (viewportMode !== "desktop") return;

      let active = true;
      let frame = 0;
      void document.fonts.ready.then(() => {
        if (!active) return;
        frame = requestAnimationFrame(() => {
          void emit("default").then(() => {
            if (active) done();
          });
        });
      });
      return () => {
        active = false;
        cancelAnimationFrame(frame);
      };
    }, [viewportMode]);
  }

  const selectIssue = (issue: Issue) => {
    setDetailOpen(true);
    if (InitialIssues.some(({ id }) => id === issue.id)) {
      setLocalSelection(undefined);
      void navigate(href("/issues/:issueId", { issueId: issue.id }));
    } else {
      setLocalSelection(issue.id);
    }
  };

  const updateSelectedStatus = (status: IssueStatus) => {
    setIssues((current) =>
      updateIssueStatus(current, selectedIssue.id, status),
    );
  };

  const addComment = (message: string) => {
    setIssues((current) =>
      addIssueActivity(current, selectedIssue.id, {
        actor: "maya",
        id: `comment-${selectedIssue.id}-${selectedIssue.activities.length}`,
        message,
        time: "just now",
      }),
    );
  };

  const createIssue = (input: NewIssueInput) => {
    const issue = createLocalIssue(nextSequence, input);
    setIssues((current) => [issue, ...current]);
    setNextSequence((current) => current + 1);
    setFilters({ ...DefaultFilters, scope: "all" });
    setLocalSelection(issue.id);
    setDetailOpen(true);
  };

  const reset = () => {
    setIssues(InitialIssues);
    setFilters(DefaultFilters);
    setGroupBy("status");
    setDensity("comfortable");
    setLocalSelection(undefined);
    setNextSequence(143);
    setDetailOpen(true);
    void navigate(href("/issues/:issueId", { issueId: DefaultIssue.id }));
  };

  return (
    <SidebarProvider
      data-preview-lab="workspace"
      data-viewport-mode={viewportMode}
    >
      <AppSidebar
        filters={filters}
        issues={issues}
        onFiltersChange={setFilters}
        onReset={reset}
      />
      <SidebarInset className="h-svh min-w-0 overflow-hidden bg-background">
        <div className="flex h-full min-w-0 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 md:h-12 md:px-4">
            <SidebarTrigger className="md:hidden">
              <MenuIcon data-icon="inline-start" />
              <span className="sr-only">Open workspace navigation</span>
            </SidebarTrigger>
            <PreviewMark className="size-6 text-primary md:hidden" />
            <div className="hidden min-w-0 items-center gap-1.5 text-xs text-muted-foreground md:flex">
              <span>Preview Lab</span>
              <span aria-hidden="true">/</span>
              <span className="text-foreground">Issues</span>
            </div>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold md:hidden">
              {ScopeTitles[filters.scope]}
            </span>
            <Button
              aria-label={mobileSearchOpen ? "Close search" : "Search issues"}
              className="md:hidden"
              onClick={() => setMobileSearchOpen((open) => !open)}
              size="icon-sm"
              variant="ghost"
            >
              {mobileSearchOpen ? <XIcon /> : <SearchIcon />}
            </Button>
            <div className="ml-auto hidden md:block">
              <NewIssueDialog onCreate={createIssue} />
            </div>
            <NewIssueDialog
              onCreate={createIssue}
              triggerClassName="md:hidden"
            />
          </header>

          {mobileSearchOpen ? (
            <div className="shrink-0 border-b bg-muted/20 p-3 md:hidden">
              <Input
                autoFocus
                onChange={(event) =>
                  setFilters({ ...filters, query: event.currentTarget.value })
                }
                placeholder="Search by title, ID, project, or label"
                value={filters.query}
              />
            </div>
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1">
            <section
              className="flex min-w-0 flex-1 flex-col"
              aria-labelledby="issues-heading"
            >
              <div className="hidden shrink-0 px-4 pt-5 pb-3 md:block md:px-6 md:pt-6">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h1
                      className="text-xl font-semibold tracking-[-0.025em] md:text-2xl"
                      id="issues-heading"
                    >
                      {ScopeTitles[filters.scope]}
                    </h1>
                    <p className="mt-1 text-xs text-muted-foreground md:text-sm">
                      {visibleIssues.length} of {issues.length} issues · local,
                      repeatable demo data
                    </p>
                  </div>
                  <div className="hidden items-center gap-2 lg:flex">
                    <span className="inline-flex size-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_oklch(0.94_0.04_155)]" />
                    <span className="text-xs text-muted-foreground">
                      Preview agent ready
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 border-y bg-muted/20 px-3 py-2 md:px-5">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        className="flex-1 justify-between sm:flex-none sm:justify-center"
                        size="sm"
                        variant="outline"
                      />
                    }
                  >
                    <FilterIcon data-icon="inline-start" />
                    <span>Filter</span>
                    {filters.status !== "all" ? (
                      <span className="text-primary">
                        {StatusLabels[filters.status].en}
                      </span>
                    ) : null}
                    <ChevronDownIcon data-icon="inline-end" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-44">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Status</DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() =>
                          setFilters({ ...filters, status: "all" })
                        }
                      >
                        <ListFilterIcon aria-hidden="true" />
                        Any status
                        {filters.status === "all" ? (
                          <CheckIcon className="ml-auto" />
                        ) : null}
                      </DropdownMenuItem>
                      {IssueStatuses.map((status) => (
                        <DropdownMenuItem
                          key={status}
                          onClick={() => setFilters({ ...filters, status })}
                        >
                          <span className="flex-1">
                            {StatusLabels[status].en}
                          </span>
                          {filters.status === status ? (
                            <CheckIcon className="ml-auto" />
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        className="flex-1 justify-between sm:flex-none sm:justify-center"
                        size="sm"
                        variant="outline"
                      />
                    }
                  >
                    <ArrowDownUpIcon data-icon="inline-start" />
                    <span>Group:</span>
                    {groupBy === "status" ? "Status" : "Priority"}
                    <ChevronDownIcon data-icon="inline-end" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Group issues</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setGroupBy("status")}>
                        Status
                        {groupBy === "status" ? (
                          <CheckIcon className="ml-auto" />
                        ) : null}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setGroupBy("priority")}>
                        Priority
                        {groupBy === "priority" ? (
                          <CheckIcon className="ml-auto" />
                        ) : null}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        className="ml-auto hidden md:inline-flex"
                        size="sm"
                        variant="ghost"
                      />
                    }
                  >
                    <SlidersHorizontalIcon data-icon="inline-start" />
                    Display
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Row density</DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() => setDensity("comfortable")}
                      >
                        Comfortable
                        {density === "comfortable" ? (
                          <CheckIcon className="ml-auto" />
                        ) : null}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDensity("compact")}>
                        Compact
                        {density === "compact" ? (
                          <CheckIcon className="ml-auto" />
                        ) : null}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div
                className="min-h-0 flex-1 overflow-auto"
                data-preview-region="issues-list"
              >
                {issueGroups.length === 0 ? (
                  <Empty className="h-full rounded-none border-0">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Rows3Icon aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle>No issues match these filters</EmptyTitle>
                      <EmptyDescription>
                        Change a filter or reset the local demo from the profile
                        menu.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <Table className="table-auto md:table-fixed">
                    <TableHeader className="sticky top-0 z-10 hidden bg-background/95 backdrop-blur md:table-header-group">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[5.25rem] pl-5 font-mono text-[11px] text-muted-foreground">
                          ID
                        </TableHead>
                        <TableHead>Issue</TableHead>
                        <TableHead className="w-[7.25rem]">Status</TableHead>
                        <TableHead className="w-24">Priority</TableHead>
                        <TableHead className="w-16">Owner</TableHead>
                        <TableHead className="hidden w-36 lg:table-cell">
                          Project
                        </TableHead>
                        <TableHead className="w-14 pr-5 text-right">
                          Updated
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {issueGroups.map((group) => (
                        <Fragment key={group.key}>
                          <TableRow className="h-9 bg-muted/35 hover:bg-muted/35">
                            <TableCell
                              className="px-4 py-1.5 text-xs font-semibold text-muted-foreground md:px-5"
                              colSpan={7}
                            >
                              <span>{group.label}</span>
                              <span className="ml-2 font-normal tabular-nums text-muted-foreground/70">
                                {group.issues.length}
                              </span>
                            </TableCell>
                          </TableRow>
                          {group.issues.map((issue) => (
                            <IssueRow
                              density={density}
                              issue={issue}
                              key={issue.id}
                              onSelect={selectIssue}
                              selected={issue.id === selectedIssue.id}
                            />
                          ))}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </section>

            <aside
              className="hidden w-[26rem] shrink-0 border-l bg-background xl:block"
              data-inspection-detail-active={
                viewportMode === "desktop" ? "true" : undefined
              }
              data-inspection-ignore={
                viewportMode === "mobile" ? "true" : undefined
              }
            >
              <IssueDetail
                issue={selectedIssue}
                onAddComment={addComment}
                onStatusChange={updateSelectedStatus}
              />
            </aside>
          </div>
        </div>
      </SidebarInset>

      <Sheet
        onOpenChange={setDetailOpen}
        onOpenChangeComplete={(open) => {
          preview: {
            if (open && viewportMode === "mobile") {
              void document.fonts.ready.then(() =>
                requestAnimationFrame(() => {
                  void emit("default").then(done);
                }),
              );
            }
          }
        }}
        open={viewportMode === "mobile" && detailOpen}
      >
        <SheetContent
          className="h-[78svh] max-h-[78svh] gap-0 overflow-hidden rounded-t-[1.5rem]"
          data-inspection-detail-active={
            viewportMode === "mobile" ? "true" : undefined
          }
          initialFocus={false}
          side="bottom"
        >
          <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border" />
          <SheetHeader className="sr-only">
            <SheetTitle>{getIssueTitle(selectedIssue, "en")}</SheetTitle>
            <SheetDescription>Details for {selectedIssue.id}</SheetDescription>
          </SheetHeader>
          <IssueDetail
            className="min-h-0 flex-1"
            issue={selectedIssue}
            onAddComment={addComment}
            onStatusChange={updateSelectedStatus}
          />
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
};

export const ErrorBoundary = () => {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 p-6">
      <section className="w-full max-w-md rounded-2xl border bg-background p-7 text-center shadow-sm">
        <PreviewMark className="mx-auto size-10 text-primary" />
        <p className="mt-5 font-mono text-xs text-primary">
          {notFound ? "404 / ISSUE_NOT_FOUND" : "PREVIEW_LAB_ERROR"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {notFound
            ? "This issue is not in the local fixture."
            : "The workspace could not open."}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Open the stable demo route to return to the repeatable workspace.
        </p>
        <Button
          className="mt-5"
          onClick={() => {
            window.location.href = href("/issues/:issueId", {
              issueId: DefaultIssue.id,
            });
          }}
        >
          Open {DefaultIssue.id}
        </Button>
      </section>
    </main>
  );
};

export default IssuesRoute;
