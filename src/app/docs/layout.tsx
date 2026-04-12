import { source } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import "fumadocs-ui/style.css";
import "./docs-theme.css";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="docs-wrapper">
      <DocsLayout
        tree={source.getPageTree()}
        nav={{
          title: "txtfx docs",
        }}
        links={[
          { text: "Editor", url: "/editor" },
          { text: "Home", url: "/" },
        ]}
      >
        {children}
      </DocsLayout>
    </div>
  );
}
