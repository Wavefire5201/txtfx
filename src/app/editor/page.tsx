import "@/styles/editor.css";
import { Toolbar } from "@/components/editor/Toolbar";
import { ToolPanel } from "@/components/editor/ToolPanel";
import { Canvas } from "@/components/editor/Canvas";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";
import { Timeline } from "@/components/editor/Timeline";
import { ToastContainer } from "@/components/editor/Toast";
import { KeyboardShortcuts } from "@/components/editor/KeyboardShortcuts";

export const metadata = {
  title: "txtfx - editor",
};

export default function EditorPage() {
  return (
    <div className="editor">
      <Toolbar />
      <ToolPanel />
      <Canvas />
      <PropertiesPanel />
      <Timeline />
      <ToastContainer />
      <KeyboardShortcuts />
    </div>
  );
}
