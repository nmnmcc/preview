import { PreviewMark } from "~/components/preview-mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "~/components/ui/input-group";
import { Kbd } from "~/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "~/components/ui/sidebar";
import {
  getPerson,
  Projects,
  type Issue,
  type IssueFilters,
  type IssueScope,
  type ProjectName,
} from "~/features/issues/model";
import {
  ArchiveIcon,
  BoxesIcon,
  ChevronUpIcon,
  CircleDotDashedIcon,
  GaugeIcon,
  InboxIcon,
  RotateCcwIcon,
  SearchIcon,
  UserRoundIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { PersonAvatar } from "./issues/issue-metadata";

const ScopeItems = [
  { icon: CircleDotDashedIcon, label: "Active issues", value: "active" },
  { icon: UserRoundIcon, label: "My issues", value: "mine" },
  { icon: ArchiveIcon, label: "Backlog", value: "backlog" },
  { icon: InboxIcon, label: "All issues", value: "all" },
] as const satisfies ReadonlyArray<{
  readonly icon: typeof CircleDotDashedIcon;
  readonly label: string;
  readonly value: IssueScope;
}>;

const ProjectColors = {
  "Capture engine": "bg-violet-500",
  "Developer experience": "bg-sky-500",
  Infrastructure: "bg-emerald-500",
} as const satisfies Readonly<Record<ProjectName, string>>;

export const AppSidebar = ({
  filters,
  issues,
  onFiltersChange,
  onReset,
}: {
  readonly filters: IssueFilters;
  readonly issues: ReadonlyArray<Issue>;
  readonly onFiltersChange: (filters: IssueFilters) => void;
  readonly onReset: () => void;
}) => {
  const searchRef = useRef<HTMLInputElement>(null);
  const { isMobile, setOpenMobile } = useSidebar();
  const choose = (nextFilters: IssueFilters) => {
    onFiltersChange(nextFilters);
    if (isMobile) setOpenMobile(false);
  };

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
    };

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const countForScope = (scope: IssueScope) =>
    issues.filter((issue) => {
      if (scope === "all") return true;
      if (scope === "backlog") return issue.status === "backlog";
      if (scope === "mine") {
        return issue.assignee === "maya" && issue.status !== "done";
      }
      return issue.status !== "done";
    }).length;

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-3 px-3 pt-4">
        <div className="flex h-9 items-center gap-2.5 px-1">
          <PreviewMark className="size-7 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold tracking-[-0.01em]">
              Preview Lab
            </div>
            <div className="text-[11px] text-muted-foreground">
              Agent workspace
            </div>
          </div>
          <GaugeIcon
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
        </div>
        <InputGroup className="bg-background shadow-xs">
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search issues"
            onChange={(event) =>
              onFiltersChange({ ...filters, query: event.currentTarget.value })
            }
            placeholder="Search issues"
            ref={searchRef}
            value={filters.query}
          />
          <InputGroupAddon align="inline-end">
            <Kbd>/</Kbd>
          </InputGroupAddon>
        </InputGroup>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ScopeItems.map(({ icon: Icon, label, value }) => (
                <SidebarMenuItem key={value}>
                  <SidebarMenuButton
                    isActive={filters.scope === value}
                    onClick={() => choose({ ...filters, scope: value })}
                    tooltip={label}
                  >
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>{countForScope(value)}</SidebarMenuBadge>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={filters.project === "all"}
                  onClick={() => choose({ ...filters, project: "all" })}
                >
                  <BoxesIcon aria-hidden="true" />
                  <span>All projects</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {Projects.map((project) => (
                <SidebarMenuItem key={project}>
                  <SidebarMenuButton
                    isActive={filters.project === project}
                    onClick={() => choose({ ...filters, project })}
                    tooltip={project}
                  >
                    <span
                      aria-hidden="true"
                      className={`size-3.5 rounded-[4px] ${ProjectColors[project]}`}
                    />
                    <span>{project}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-3">
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
            <PersonAvatar id="maya" />
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-sm font-medium">
                {getPerson("maya").name}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                Product engineer
              </div>
            </div>
            <ChevronUpIcon aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52" side="top">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Demo controls</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => choose({ ...filters, scope: "mine" })}
              >
                <UserRoundIcon aria-hidden="true" />
                Show my issues
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onReset}>
              <RotateCcwIcon aria-hidden="true" />
              Reset local demo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
};
