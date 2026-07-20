"use client";

import { useEffect, useMemo, useState } from "react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Tag,
  Trash2,
  X,
} from "lucide-react";

import type { Category, CategoryFilter, Session } from "@/lib/schema";
import { sessionStatusIcons } from "@/lib/labels";
import { sessionMatchesCategoryFilter } from "@/lib/session-filter";
import { youtubeThumbnailUrl } from "@/lib/youtube/parse-url";
import { cn } from "@/lib/utils";
import { CategoryManageDialog } from "@/components/workspace/CategoryManageDialog";
import { DeleteConfirmDialog } from "@/components/workspace/DeleteConfirmDialog";
import { Pane1Toggle } from "@/components/workspace/Pane1Toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebar } from "@/components/ui/sidebar";

type SessionLibraryPaneProps = {
  sessions: Session[];
  categories: Category[];
  selectedSessionId: string | null;
  searchQuery: string;
  categoryFilter: CategoryFilter;
  isSearching?: boolean;
  onSearchQueryChange: (query: string) => void;
  onCategoryFilterChange: (filter: CategoryFilter) => void;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void | Promise<void>;
  onDeleteAllSessions: () => void;
  onAssignCategory: (
    sessionId: string,
    categoryId: string | null,
  ) => void | Promise<void>;
  onCreateCategory: (name: string) => void | Promise<void>;
  onUpdateCategory: (id: string, name: string) => void | Promise<void>;
  onDeleteCategory: (id: string) => void | Promise<void>;
};

function groupLabel(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return "今日";
  if (isYesterday(date)) return "昨日";
  return format(date, "M月d日", { locale: ja });
}

type DateGroup = {
  dateKey: string;
  label: string;
  sessions: Session[];
};

function buildDateGroups(sessions: Session[]): DateGroup[] {
  const map = new Map<string, Session[]>();
  for (const session of sessions) {
    const dateKey = format(parseISO(session.updatedAt), "yyyy-MM-dd");
    const list = map.get(dateKey) ?? [];
    list.push(session);
    map.set(dateKey, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, items]) => ({
      dateKey,
      label: groupLabel(items[0]!.updatedAt),
      sessions: items,
    }));
}

export function SessionLibraryPane({
  sessions,
  categories,
  selectedSessionId,
  searchQuery,
  categoryFilter,
  isSearching = false,
  onSearchQueryChange,
  onCategoryFilterChange,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onDeleteAllSessions,
  onAssignCategory,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
}: SessionLibraryPaneProps) {
  const isMobile = useIsMobile();
  const { setOpenMobile } = useSidebar();
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [categoryManageOpen, setCategoryManageOpen] = useState(false);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => new Set());

  const visibleSessions = useMemo(
    () =>
      sessions.filter((session) =>
        sessionMatchesCategoryFilter(session, categoryFilter),
      ),
    [sessions, categoryFilter],
  );

  const groups = useMemo(
    () => buildDateGroups(visibleSessions),
    [visibleSessions],
  );

  const selectedDateKey = useMemo(() => {
    if (!selectedSessionId) return null;
    const session = visibleSessions.find((s) => s.id === selectedSessionId);
    if (!session) return null;
    return format(parseISO(session.updatedAt), "yyyy-MM-dd");
  }, [selectedSessionId, visibleSessions]);

  useEffect(() => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (selectedDateKey) next.add(selectedDateKey);
      const todayKey = format(new Date(), "yyyy-MM-dd");
      if (groups.some((group) => group.dateKey === todayKey)) {
        next.add(todayKey);
      }
      return next;
    });
  }, [selectedDateKey, groups]);

  const selectSession = (id: string) => {
    onSelectSession(id);
    if (isMobile) setOpenMobile(false);
  };

  const toggleDateGroup = (group: DateGroup) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(group.dateKey)) {
        next.delete(group.dateKey);
      } else {
        next.add(group.dateKey);
      }
      return next;
    });
  };

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const session of sessions) {
      if (session.categoryId) {
        counts.set(session.categoryId, (counts.get(session.categoryId) ?? 0) + 1);
      }
    }
    return counts;
  }, [sessions]);

  const uncategorizedCount = useMemo(
    () => sessions.filter((s) => s.categoryId == null).length,
    [sessions],
  );

  const categoryChips = useMemo(
    () => [
      { id: "all" as CategoryFilter, label: "すべて", count: sessions.length },
      {
        id: "uncategorized" as CategoryFilter,
        label: "未分類",
        count: uncategorizedCount,
      },
      ...categories.map((category) => ({
        id: category.id as CategoryFilter,
        label: category.name,
        count: categoryCounts.get(category.id) ?? 0,
      })),
    ],
    [sessions.length, uncategorizedCount, categories, categoryCounts],
  );

  return (
    <>
      <Sidebar
        collapsible="icon"
        className={cn(
          "border-r border-sidebar-border [&_[data-slot=sidebar-container]]:bg-sidebar",
          isMobile && "vidnote-mobile-sheet",
        )}
      >
        <SidebarHeader
          className={cn(
            "flex h-12 flex-row items-center justify-between gap-1 border-b border-sidebar-border px-2",
            isMobile && "h-14 px-4",
          )}
        >
          <span
            className={cn(
              "truncate text-sm font-semibold group-data-[collapsible=icon]:hidden",
              isMobile && "text-lg",
            )}
          >
            履歴
          </span>
          {!isMobile && <Pane1Toggle />}
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupContent>
              <div className="flex flex-col gap-2 px-2 pt-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="タイトル・字幕・ノートを検索"
                    value={searchQuery}
                    className={cn("pl-8 pr-8", isMobile && "h-11 text-base")}
                    autoComplete="off"
                    enterKeyHint="search"
                    onChange={(e) => onSearchQueryChange(e.target.value)}
                  />
                  {searchQuery && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="absolute top-1/2 right-1 -translate-y-1/2"
                      onClick={() => onSearchQueryChange("")}
                    >
                      <X />
                      <span className="sr-only">検索をクリア</span>
                    </Button>
                  )}
                </div>
                {isSearching && (
                  <p className="px-1 text-xs text-muted-foreground">検索中…</p>
                )}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>

          {isMobile && (
            <SidebarGroup className="group-data-[collapsible=icon]:hidden">
              <SidebarGroupContent>
                <div className="flex items-center justify-between px-4 pt-1 pb-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    カテゴリー
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setCategoryManageOpen(true)}
                    aria-label="カテゴリー管理"
                  >
                    <Settings2 className="size-4" />
                  </Button>
                </div>
                <div className="flex gap-2 overflow-x-auto px-4 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {categoryChips.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => onCategoryFilterChange(chip.id)}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
                        categoryFilter === chip.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-foreground",
                      )}
                    >
                      {chip.label}
                      <span className="ml-1 text-xs opacity-70">{chip.count}</span>
                    </button>
                  ))}
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {!isMobile && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center justify-between group-data-[collapsible=icon]:hidden">
              <span>カテゴリー</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setCategoryManageOpen(true)}
              >
                <Settings2 />
                <span className="sr-only">カテゴリー管理</span>
              </Button>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={categoryFilter === "all"}
                    onClick={() => onCategoryFilterChange("all")}
                    tooltip="すべて"
                  >
                    <FolderOpen />
                    <span>すべて</span>
                    <span className="ml-auto text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                      {sessions.length}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={categoryFilter === "uncategorized"}
                    onClick={() => onCategoryFilterChange("uncategorized")}
                    tooltip="未分類"
                  >
                    <Tag />
                    <span>未分類</span>
                    <span className="ml-auto text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                      {uncategorizedCount}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {categories.map((category) => (
                  <SidebarMenuItem key={category.id}>
                    <SidebarMenuButton
                      isActive={categoryFilter === category.id}
                      onClick={() => onCategoryFilterChange(category.id)}
                      tooltip={category.name}
                    >
                      <Tag />
                      <span className="truncate">{category.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                        {categoryCounts.get(category.id) ?? 0}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          )}

          {!isMobile && (
          <SidebarGroup>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
              セッション
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={onNewSession} tooltip="新規動画">
                    <Plus />
                    <span>新規動画</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {sessions.length > 0 && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setDeleteAllOpen(true)}
                      tooltip="履歴をすべて削除"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                      <span>履歴をすべて削除</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          )}

          <ScrollArea className="min-h-0 flex-1">
            {visibleSessions.length === 0 ? (
              <div
                className={cn(
                  "space-y-2 px-3 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden",
                  isMobile && "px-4 py-4 text-sm",
                )}
              >
                <p>
                  {searchQuery.trim()
                    ? "検索結果はありません"
                    : categoryFilter !== "all"
                      ? "このカテゴリーに動画はありません"
                      : sessions.length === 0
                        ? "履歴はありません"
                        : "表示できる履歴がありません"}
                </p>
                {!searchQuery.trim() &&
                  categoryFilter === "all" &&
                  sessions.length === 0 &&
                  !isMobile && (
                    <p>
                      ローカル開発中は{" "}
                      <span className="font-medium text-foreground">
                        http://localhost:3000
                      </span>{" "}
                      を開いてください。Vercel 本番とデータベースが異なる場合、履歴が表示されないことがあります。
                    </p>
                  )}
              </div>
            ) : (
              groups.map((group) => {
                const expanded = expandedDates.has(group.dateKey);
                return (
                  <SidebarGroup key={group.dateKey}>
                    <button
                      type="button"
                      className={cn(
                        "flex h-8 w-full shrink-0 items-center gap-1 rounded-md px-2 text-left text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden",
                        isMobile && "h-11 px-4 text-sm",
                      )}
                      onClick={() => toggleDateGroup(group)}
                      aria-expanded={expanded}
                      aria-label={`${group.label}（${group.sessions.length}件）`}
                    >
                      {expanded ? (
                        <ChevronDown className="size-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0" />
                      )}
                      <span className="truncate">{group.label}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {group.sessions.length}
                      </span>
                    </button>
                    {expanded && (
                      <SidebarGroupContent>
                        <SidebarMenu>
                          {group.sessions.map((session) => {
                        const icons = sessionStatusIcons(session.status);
                        const thumbnailSrc =
                          session.youtubeId != null
                            ? youtubeThumbnailUrl(session.youtubeId)
                            : session.thumbnailUrl;
                        return (
                          <SidebarMenuItem key={session.id}>
                            <SidebarMenuButton
                              isActive={session.id === selectedSessionId}
                              onClick={() => selectSession(session.id)}
                              tooltip={session.title ?? "無題"}
                            >
                              {thumbnailSrc ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={thumbnailSrc}
                                  alt=""
                                  className="size-4 shrink-0 rounded-sm object-cover"
                                />
                              ) : (
                                <span className="size-4 shrink-0 rounded-sm bg-muted" />
                              )}
                              <span className="truncate">
                                {session.title ?? "無題の動画"}
                              </span>
                              <span className="ml-auto flex items-center gap-1 group-data-[collapsible=icon]:hidden">
                                {session.categoryName && (
                                  <Badge
                                    variant="outline"
                                    className="max-w-16 truncate text-[10px]"
                                  >
                                    {session.categoryName}
                                  </Badge>
                                )}
                                {icons.processing && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px]"
                                  >
                                    …
                                  </Badge>
                                )}
                                {icons.caption && !icons.processing && (
                                  <span className="text-[10px] text-muted-foreground">
                                    字幕
                                  </span>
                                )}
                              </span>
                            </SidebarMenuButton>
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <SidebarMenuAction showOnHover>
                                    <MoreHorizontal />
                                    <span className="sr-only">操作</span>
                                  </SidebarMenuAction>
                                }
                              />
                              <DropdownMenuContent side="right" align="start">
                                <DropdownMenuGroup>
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                      <Tag />
                                      カテゴリーを変更
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      <DropdownMenuItem
                                        onClick={() =>
                                          void onAssignCategory(session.id, null)
                                        }
                                      >
                                        未分類
                                      </DropdownMenuItem>
                                      {categories.length > 0 && (
                                        <DropdownMenuSeparator />
                                      )}
                                      {categories.map((category) => (
                                        <DropdownMenuItem
                                          key={category.id}
                                          onClick={() =>
                                            void onAssignCategory(
                                              session.id,
                                              category.id,
                                            )
                                          }
                                        >
                                          {category.name}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => setDeleteTarget(session)}
                                  >
                                    <Trash2 />
                                    削除
                                  </DropdownMenuItem>
                                </DropdownMenuGroup>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </SidebarMenuItem>
                        );
                      })}
                        </SidebarMenu>
                      </SidebarGroupContent>
                    )}
                  </SidebarGroup>
                );
              })
            )}
          </ScrollArea>
        </SidebarContent>
      </Sidebar>

      <CategoryManageDialog
        open={categoryManageOpen}
        onOpenChange={setCategoryManageOpen}
        categories={categories}
        onCreateCategory={onCreateCategory}
        onUpdateCategory={onUpdateCategory}
        onDeleteCategory={onDeleteCategory}
      />

      <DeleteConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="セッションを削除"
        itemName={deleteTarget?.title ?? "このセッション"}
        onConfirm={async () => {
          if (deleteTarget) {
            await onDeleteSession(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
      />

      <DeleteConfirmDialog
        open={deleteAllOpen}
        onOpenChange={setDeleteAllOpen}
        title="履歴をすべて削除"
        itemName={`${sessions.length} 件のセッション`}
        description={`${sessions.length} 件のセッションをすべて削除します。字幕・要点・ノートも消えます。この操作は取り消せません。`}
        onConfirm={() => {
          onDeleteAllSessions();
          setDeleteAllOpen(false);
        }}
      />
    </>
  );
}
