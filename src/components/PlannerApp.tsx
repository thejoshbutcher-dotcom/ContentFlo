"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  CalendarDays,
  GalleryHorizontalEnd,
  Kanban,
  LayoutGrid,
  Lightbulb,
  Mic,
  MonitorPlay,
  Plus,
  Settings2,
  Smartphone,
  Table2,
} from "lucide-react";
import { usePlanner } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import { ContentType, ViewId } from "@/lib/types";
import { AccountSwitcher, ProfileNavButton } from "./AccountSwitcher";
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
  return MOBILE_GROUPS.find((g) => g.views.includes(viewId))?.id ?? "create";
}

export default function PlannerApp() {
  const [mounted, setMounted] = useState(false);
  const [viewId, setViewId] = useState<ViewId>("ideate");
  const [search, setSearch] = useState("");
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  const cards = usePlanner((s) => s.cards);
  const addCard = usePlanner((s) => s.addCard);

  useEffect(() => setMounted(true), []);
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

  // Only surface Brand setup automatically right after a new profile is created.
  function handleAccountSwitched(isNew: boolean) {
    setOpenCardId(null);
    setViewId("ideate");
    setSearch("");
    if (isNew) setShowSetup(true);
  }

  const setupAction = {
    label: "Brand setup",
    icon: <Settings2 size={13} />,
    onClick: () => setShowSetup(true),
  };

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
          <AccountSwitcher onSwitched={handleAccountSwitched} />
        </div>
      </aside>

      <div className="main-col">
        <div className="topbar">
          <span className="view-title">{view.title}</span>
          <span className="view-note">{view.note}</span>
          {view.id === "board-buckets" && (
            <button className="btn btn-ghost" onClick={() => setShowSetup(true)}>
              <Settings2 size={14} /> <span className="btn-label">Brand setup</span>
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
        <ProfileNavButton
          onSwitched={handleAccountSwitched}
          actions={[setupAction]}
        />
      </nav>

      {openCardId && (
        <CardModal cardId={openCardId} onClose={() => setOpenCardId(null)} />
      )}
      {showSetup && <SetupWizard onClose={() => setShowSetup(false)} />}
    </div>
  );
}
