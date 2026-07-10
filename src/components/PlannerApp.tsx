"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  CalendarDays,
  Download,
  GalleryHorizontalEnd,
  Kanban,
  LayoutGrid,
  Lightbulb,
  Mic,
  MonitorPlay,
  Plus,
  RotateCcw,
  Settings2,
  Smartphone,
  Table2,
  Upload,
} from "lucide-react";
import { usePlanner } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import { ContentCard, ContentType, ViewId } from "@/lib/types";
import { AccountBubble, AccountSwitcher } from "./AccountSwitcher";
import BoardView from "./BoardView";
import BrainstormView from "./BrainstormView";
import CalendarView from "./CalendarView";
import CardModal from "./CardModal";
import SetupWizard from "./SetupWizard";
import TableView from "./TableView";
import { VIEW_DEFS } from "./views";

const NAV_ICONS: Record<ViewId, React.ReactNode> = {
  ideate: <Lightbulb size={15} />,
  "board-short": <Smartphone size={15} />,
  "board-long": <MonitorPlay size={15} />,
  "board-podcast": <Mic size={15} />,
  "board-carousel": <GalleryHorizontalEnd size={15} />,
  "board-buckets": <LayoutGrid size={15} />,
  calendar: <CalendarDays size={15} />,
  table: <Table2 size={15} />,
};

const DEST_TO_VIEW: Record<ContentType, ViewId> = {
  "Short form": "board-short",
  "Long form": "board-long",
  Podcast: "board-podcast",
  Carousel: "board-carousel",
};

type MobileGroup = "create" | "pipeline" | "plan";

const MOBILE_GROUPS: {
  id: MobileGroup;
  label: string;
  icon: React.ReactNode;
  views: ViewId[];
}[] = [
  { id: "create", label: "Create", icon: <Lightbulb size={18} />, views: ["ideate"] },
  {
    id: "pipeline",
    label: "Pipeline",
    icon: <Kanban size={18} />,
    views: ["board-short", "board-long", "board-podcast", "board-carousel"],
  },
  {
    id: "plan",
    label: "Plan",
    icon: <CalendarDays size={18} />,
    views: ["board-buckets", "calendar", "table"],
  },
];

function groupOf(viewId: ViewId): MobileGroup {
  return (
    MOBILE_GROUPS.find((g) => g.views.includes(viewId))?.id ?? "pipeline"
  );
}

export default function PlannerApp() {
  const [mounted, setMounted] = useState(false);
  const [viewId, setViewId] = useState<ViewId>("board-short");
  const [search, setSearch] = useState("");
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cards = usePlanner((s) => s.cards);
  const addCard = usePlanner((s) => s.addCard);
  const importAll = usePlanner((s) => s.importAll);
  const resetToSeed = usePlanner((s) => s.resetToSeed);

  useEffect(() => {
    setMounted(true);
    if (!useProfile.getState().setupComplete) setShowSetup(true);
  }, []);
  if (!mounted) {
    return (
      <div className="app-frame">
        <div className="sidebar" />
        <div className="main-col" />
      </div>
    );
  }

  const view = VIEW_DEFS.find((v) => v.id === viewId)!;
  const activeGroup = groupOf(viewId);
  const groupViews =
    MOBILE_GROUPS.find((g) => g.id === activeGroup)?.views ?? [];

  const countFor = (id: ViewId) => {
    const def = VIEW_DEFS.find((v) => v.id === id)!;
    if (def.kind === "calendar") return cards.filter((c) => c.postingDate).length;
    if (def.kind === "table") return cards.length;
    if (def.kind === "slate") return null;
    return cards.filter((c) => !def.filter || def.filter(c)).length;
  };

  function newIdea() {
    const card = addCard({
      title: "",
      contentType: view.newCardType ?? "Short form",
      status: "ideas",
    });
    setOpenCardId(card.id);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(cards, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `creatorflo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    file.text().then((text) => {
      try {
        const data = JSON.parse(text) as ContentCard[];
        if (Array.isArray(data)) importAll(data);
      } catch {
        alert("That file doesn't look like a CreatorFlo export.");
      }
    });
  }

  function handleAccountSwitched() {
    setOpenCardId(null);
    if (!useProfile.getState().setupComplete) setShowSetup(true);
  }

  const groups: { label: string; ids: ViewId[] }[] = [
    { label: "Create", ids: ["ideate"] },
    {
      label: "Pipeline",
      ids: ["board-short", "board-long", "board-podcast", "board-carousel"],
    },
    { label: "Plan", ids: ["board-buckets", "calendar", "table"] },
  ];

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Image
            src="/brand/logo-white.png"
            alt="CreatorFlo"
            width={148}
            height={33}
            priority
            className="brand-logo"
          />
          <AccountSwitcher onSwitched={handleAccountSwitched} />
        </div>

        {groups.map((g) => (
          <nav className="nav-group" key={g.label}>
            <div className="nav-group-label t-eyebrow">{g.label}</div>
            {g.ids.map((id) => {
              const def = VIEW_DEFS.find((v) => v.id === id)!;
              const count = countFor(id);
              return (
                <button
                  key={id}
                  className={`nav-item${viewId === id ? " active" : ""}`}
                  onClick={() => setViewId(id)}
                >
                  {NAV_ICONS[id]}
                  <span className="label">{def.label}</span>
                  {count !== null && <span className="count t-mono">{count}</span>}
                </button>
              );
            })}
          </nav>
        ))}

        <div className="sidebar-foot">
          <button className="foot-btn" onClick={() => setShowSetup(true)}>
            <Settings2 size={13} />
            <span className="label">Brand setup</span>
          </button>
          <button className="foot-btn" onClick={exportJson}>
            <Download size={13} />
            <span className="label">Export data</span>
          </button>
          <button className="foot-btn" onClick={() => fileRef.current?.click()}>
            <Upload size={13} />
            <span className="label">Import data</span>
          </button>
          <button
            className="foot-btn"
            onClick={() => {
              if (confirm("Replace everything with the starter examples?"))
                resetToSeed();
            }}
          >
            <RotateCcw size={13} />
            <span className="label">Reset to examples</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = "";
            }}
          />
        </div>
      </aside>

      <div className="main-col">
        <div className="topbar">
          <span className="view-title">{view.title}</span>
          <span className="view-note">{view.note}</span>
          {view.id === "board-buckets" && (
            <button className="btn btn-ghost" onClick={() => setShowSetup(true)}>
              <Settings2 size={14} /> Brand setup
            </button>
          )}
          <input
            className="search-input"
            placeholder="Search titles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn btn-amber" onClick={newIdea}>
            <Plus size={15} /> <span className="btn-label">New idea</span>
          </button>
        </div>

        {groupViews.length > 1 && (
          <div className="sub-tabs">
            {groupViews.map((id) => {
              const def = VIEW_DEFS.find((v) => v.id === id)!;
              return (
                <button
                  key={id}
                  className={`sub-tab${viewId === id ? " on" : ""}`}
                  onClick={() => setViewId(id)}
                >
                  {def.label}
                </button>
              );
            })}
          </div>
        )}

        {view.kind === "board" && (
          <BoardView view={view} search={search} onOpen={setOpenCardId} />
        )}
        {view.kind === "calendar" && (
          <CalendarView search={search} onOpen={setOpenCardId} />
        )}
        {view.kind === "table" && (
          <TableView search={search} onOpen={setOpenCardId} />
        )}
        {view.kind === "slate" && (
          <BrainstormView
            onOpen={setOpenCardId}
            onGoToBoard={(dest) => setViewId(DEST_TO_VIEW[dest])}
            onOpenSetup={() => setShowSetup(true)}
          />
        )}
      </div>

      <nav className="bottom-nav">
        {MOBILE_GROUPS.map((g) => (
          <button
            key={g.id}
            className={`bottom-tab${activeGroup === g.id ? " on" : ""}`}
            onClick={() => setViewId(g.views[0])}
          >
            {g.icon}
            <span>{g.label}</span>
          </button>
        ))}
      </nav>

      <AccountBubble
        onSwitched={handleAccountSwitched}
        actions={[
          {
            label: "Brand setup",
            icon: <Settings2 size={13} />,
            onClick: () => setShowSetup(true),
          },
          {
            label: "Export data",
            icon: <Download size={13} />,
            onClick: exportJson,
          },
          {
            label: "Import data",
            icon: <Upload size={13} />,
            onClick: () => fileRef.current?.click(),
          },
        ]}
      />

      {openCardId && (
        <CardModal cardId={openCardId} onClose={() => setOpenCardId(null)} />
      )}
      {showSetup && <SetupWizard onClose={() => setShowSetup(false)} />}
    </div>
  );
}
