"use client";

import { useMemo, useState } from "react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";

import type { Session } from "@/lib/schema";
import { sessionStatusIcons } from "@/lib/labels";
import { youtubeThumbnailUrl } from "@/lib/youtube/parse-url";
import { DeleteConfirmDialog } from "@/components/workspace/DeleteConfirmDialog";
import { Pane1Toggle } from "@/components/workspace/Pane1Toggle";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

type SessionLibraryPaneProps = {
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void | Promise<void>;
  onDeleteAllSessions: () => void;
};

function groupLabel(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return "今日";
  if (isYesterday(date)) return "昨日";
  return format(date, "M月d日", { locale: ja });
}

function groupSessions(sessions: Session[]): Map<string, Session[]> {
  const map = new Map<string, Session[]>();
  for (const session of sessions) {
    const label = groupLabel(session.updatedAt);
    const list = map.get(label) ?? [];
    list.push(session);
    map.set(label, list);
  }
  return map;
}

export function SessionLibraryPane({
  sessions,
  selectedSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onDeleteAllSessions,
}: SessionLibraryPaneProps) {
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const groups = useMemo(() => groupSessions(sessions), [sessions]);

  return (
    <>
      <Sidebar
        collapsible="icon"
        className="border-r border-sidebar-border [&_[data-slot=sidebar-container]]:bg-sidebar"
      >
        <SidebarHeader className="flex h-12 flex-row items-center justify-between gap-1 border-b border-sidebar-border px-2">
          <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
            VidNote
          </span>
          <Pane1Toggle />
        </SidebarHeader>

        <SidebarContent>
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

          <ScrollArea className="min-h-0 flex-1">
            {sessions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                履歴はありません
              </p>
            ) : (
              [...groups.entries()].map(([label, items]) => (
                <SidebarGroup key={label}>
                  <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
                    {label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {items.map((session) => {
                        const icons = sessionStatusIcons(session.status);
                        const thumbnailSrc =
                          session.youtubeId != null
                            ? youtubeThumbnailUrl(session.youtubeId)
                            : session.thumbnailUrl;
                        return (
                          <SidebarMenuItem key={session.id}>
                            <SidebarMenuButton
                              isActive={session.id === selectedSessionId}
                              onClick={() => onSelectSession(session.id)}
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
                </SidebarGroup>
              ))
            )}
          </ScrollArea>
        </SidebarContent>
      </Sidebar>

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
