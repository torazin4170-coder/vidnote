"use client";

import { useEffect } from "react";

import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebar } from "@/components/ui/sidebar";

type MobileHistoryHomeProps = {
  hasSession: boolean;
  isNewDraft: boolean;
};

/** モバイルでセッション未選択時は履歴シートをホーム画面として表示する */
export function MobileHistoryHome({
  hasSession,
  isNewDraft,
}: MobileHistoryHomeProps) {
  const isMobile = useIsMobile();
  const { openMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    if (!isMobile || isNewDraft || hasSession) return;
    setOpenMobile(true);
  }, [isMobile, isNewDraft, hasSession, setOpenMobile]);

  useEffect(() => {
    if (!isMobile || isNewDraft || hasSession || openMobile) return;
    setOpenMobile(true);
  }, [isMobile, isNewDraft, hasSession, openMobile, setOpenMobile]);

  return null;
}
