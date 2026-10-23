"use client";

import { useEffect, useRef } from "react";

type MermaidReadmeProps = {
  html: string;
};

let diagramSequence = 0;

export function MermaidReadme({ html }: MermaidReadmeProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = html;
    const originalBlocks = new Map<HTMLElement, HTMLElement>();
    const diagramNodes = Array.from(
      container.querySelectorAll<HTMLElement>(
        'pre[lang="mermaid"], pre[aria-label="Raw mermaid code"]',
      ),
    );

    const diagrams = diagramNodes.map((block) => {
      const diagram = document.createElement("div");
      diagram.className = "mermaid";
      diagram.textContent = block.textContent ?? "";
      originalBlocks.set(diagram, block.cloneNode(true) as HTMLElement);
      block.replaceWith(diagram);
      return diagram;
    });

    if (diagrams.length === 0) return;
    let cancelled = false;

    async function renderDiagrams() {
      try {
        const { default: mermaid } = await import("mermaid");
        if (cancelled) return;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "default",
        });
        await Promise.all(
          diagrams.map(async (diagram) => {
            try {
              const id = `project-readme-mermaid-${++diagramSequence}`;
              const { svg, bindFunctions } = await mermaid.render(
                id,
                diagram.textContent ?? "",
              );
              if (cancelled || !diagram.isConnected) return;

              diagram.innerHTML = svg;
              bindFunctions?.(diagram);
            } catch (error) {
              if (cancelled || !diagram.isConnected) return;

              console.error(
                "Could not render a Mermaid diagram in the project README.",
                error,
              );
              const original = originalBlocks.get(diagram);
              if (original) diagram.replaceWith(original);
            }
          }),
        );
      } catch (error) {
        if (cancelled) return;

        console.error(
          "Could not render a Mermaid diagram in the project README.",
          error,
        );
        for (const [diagram, original] of originalBlocks) {
          if (diagram.isConnected) diagram.replaceWith(original);
        }
      }
    }

    void renderDiagrams();
    return () => {
      cancelled = true;
    };
  }, [html]);

  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: html }} />;
}
