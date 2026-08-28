"use client";

import { useEffect, useRef } from "react";
import { Node } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { ExternalLink } from "lucide-react";
import { parseYouTubeId, thumbUrlFor } from "@/lib/inspo";

/**
 * A pasted link as a block: favicon + page title (thumbnail and channel when
 * it's a YouTube video), clickable to open in a new tab. Deliberately a CARD,
 * not an embed — it identifies the link the way a text-message preview does.
 *
 * It's an atom block, so the whole card is one unit to the grip / lasso /
 * drag system, exactly like any paragraph.
 */

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function faviconFor(url: string): string {
  // Google's favicon service: reliable, no per-site probing, cached hard.
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
    hostOf(url)
  )}&sz=64`;
}

function BookmarkCard({ node, updateAttributes }: NodeViewProps) {
  const { url, title, site, thumb, resolved } = node.attrs as {
    url: string;
    title: string | null;
    site: string | null;
    thumb: string | null;
    resolved: boolean;
  };

  // Self-hydrate once: the paste inserts only the URL, and the card fills in
  // its own metadata. `resolved` persists, so a card never refetches on every
  // open of its section.
  const fetching = useRef(false);
  useEffect(() => {
    if (resolved || fetching.current || !url) return;
    fetching.current = true;

    const run = async () => {
      const videoId = parseYouTubeId(url);
      try {
        if (videoId) {
          const res = await fetch("/api/inspo/resolve", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ urls: [url] }),
          });
          const data = res.ok ? await res.json() : null;
          const item = data?.items?.[0];
          updateAttributes({
            title: item?.title || hostOf(url),
            site: item?.channel ? `YouTube · ${item.channel}` : "YouTube",
            thumb: thumbUrlFor(videoId),
            resolved: true,
          });
          return;
        }
        const res = await fetch("/api/link-preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = res.ok ? await res.json() : null;
        updateAttributes({
          title: data?.title || hostOf(url),
          site: data?.site || hostOf(url),
          thumb: data?.image || null,
          resolved: true,
        });
      } catch {
        // Offline or blocked: the card still works as a link, titled by host.
        updateAttributes({ title: hostOf(url), site: hostOf(url), resolved: true });
      }
    };
    void run();
  }, [resolved, url, updateAttributes]);

  return (
    <NodeViewWrapper
      className="cf-bookmark"
      data-type="bookmark"
      data-url={url}
      data-title={title ?? ""}
      data-site={site ?? ""}
      data-thumb={thumb ?? ""}
      data-resolved={resolved ? "true" : "false"}
    >
      <a
        className="cf-bookmark-link"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        contentEditable={false}
        draggable={false}
        onClick={(e) => {
          // Explicit open: native anchor navigation inside a contenteditable
          // is swallowed by ProseMirror's mouse handling in some browsers.
          e.preventDefault();
          e.stopPropagation();
          window.open(url, "_blank", "noopener,noreferrer");
        }}
      >
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="cf-bookmark-thumb" src={thumb} alt="" loading="lazy" />
        )}
        <span className="cf-bookmark-meta">
          <span className="cf-bookmark-title">
            {title || (resolved ? hostOf(url) : "Loading preview…")}
          </span>
          <span className="cf-bookmark-site">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="cf-bookmark-favicon" src={faviconFor(url)} alt="" />
            {site || hostOf(url)}
          </span>
        </span>
        <span className="cf-bookmark-open">
          <ExternalLink size={13} />
        </span>
      </a>
    </NodeViewWrapper>
  );
}

export const Bookmark = Node.create({
  name: "bookmark",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      url: { default: "" },
      title: { default: null },
      site: { default: null },
      thumb: { default: null },
      resolved: { default: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="bookmark"]',
        getAttrs: (el) => {
          const d = el as HTMLElement;
          return {
            url: d.getAttribute("data-url") ?? "",
            title: d.getAttribute("data-title") || null,
            site: d.getAttribute("data-site") || null,
            thumb: d.getAttribute("data-thumb") || null,
            resolved: d.getAttribute("data-resolved") === "true",
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    // Attribute-only markup: enough to round-trip through getHTML / paste /
    // the block drag's serialization. The card's look comes from the view.
    return [
      "div",
      {
        "data-type": "bookmark",
        "data-url": node.attrs.url,
        "data-title": node.attrs.title ?? "",
        "data-site": node.attrs.site ?? "",
        "data-thumb": node.attrs.thumb ?? "",
        "data-resolved": node.attrs.resolved ? "true" : "false",
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BookmarkCard);
  },
});
