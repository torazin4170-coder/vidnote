"use client";

import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebar } from "@/components/ui/sidebar";

type MobileHistoryBridgeProps = {
  children: (openHistory: () => void) => React.ReactNode;
};

export function MobileHistoryBridge({ children }: MobileHistoryBridgeProps) {
  const isMobile = useIsMobile();
  const { setOpenMobile } = useSidebar();

  if (!isMobile) return null;

  return <>{children(() => setOpenMobile(true))}</>;
}
