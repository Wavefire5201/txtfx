"use client";

import { useState } from "react";

export interface SceneViewerProps {
  /** Full standalone-player HTML document (from exportStandaloneHTML). */
  html: string;
  /** Scene short id (for the editor + embed links). */
  id: string;
  /** Show the overlay chrome (Open in editor / Copy link / Embed). */
  chrome?: boolean;
}

export function SceneViewer({ html, id, chrome = true }: SceneViewerProps) {
  const [copied, setCopied] = useState<"" | "link" | "embed">("");

  function copy(kind: "link" | "embed") {
    const origin = window.location.origin;
    const text =
      kind === "link"
        ? `${origin}/s/${id}`
        : `<iframe src="${origin}/embed/${id}" style="width:100%;height:100%;border:0" allowfullscreen></iframe>`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(""), 1500);
    });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0a0a0e" }}>
      <iframe
        title="txtfx scene"
        srcDoc={html}
        sandbox="allow-scripts"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
      />
      {chrome && (
        <div
          style={{
            position: "fixed",
            top: 12,
            right: 12,
            display: "flex",
            gap: 8,
            fontFamily: "system-ui",
            fontSize: 12,
          }}
        >
          <a href={`/editor#shared=${id}`} style={btn}>Open in editor</a>
          <button onClick={() => copy("link")} style={btn}>
            {copied === "link" ? "Copied!" : "Copy link"}
          </button>
          <button onClick={() => copy("embed")} style={btn}>
            {copied === "embed" ? "Copied!" : "Embed"}
          </button>
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  background: "rgba(26,26,31,.85)",
  color: "#cfcfd6",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 8,
  padding: "6px 12px",
  cursor: "pointer",
  backdropFilter: "blur(8px)",
  textDecoration: "none",
};
