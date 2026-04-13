"use client";

import { useEditorStore } from "@/lib/store";

export function EditorLayout({ children }: { children: React.ReactNode }) {
  const leftCollapsed = useEditorStore((s) => s.leftPanelCollapsed);
  const rightCollapsed = useEditorStore((s) => s.rightPanelCollapsed);
  const timelineCollapsed = useEditorStore((s) => s.timelineCollapsed);

  return (
    <div
      className={`editor${leftCollapsed ? " editor--left-collapsed" : ""}${rightCollapsed ? " editor--right-collapsed" : ""}${timelineCollapsed ? " editor--timeline-collapsed" : ""}`}
    >
      <a href="#viewport" className="skip-to-content">Skip to canvas</a>
      {children}
    </div>
  );
}
