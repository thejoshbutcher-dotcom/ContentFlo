"use client";

import { useState } from "react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Check, Copy } from "lucide-react";

/**
 * Code block with a one-click copy button — built for pasting prompts into a
 * script, not just code. Works anywhere the block lives, including inside a
 * toggle.
 */
export default function CodeBlockView({ node }: NodeViewProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(node.textContent ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — leave the button silent rather than alarming */
    }
  }

  return (
    <NodeViewWrapper className="cf-codeblock">
      <button
        className={`cf-copy${copied ? " done" : ""}`}
        onClick={copy}
        contentEditable={false}
        type="button"
        aria-label={copied ? "Copied" : "Copy to clipboard"}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
      <pre>
        <NodeViewContent />
      </pre>
    </NodeViewWrapper>
  );
}
