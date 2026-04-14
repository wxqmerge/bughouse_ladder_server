import { useState, useEffect } from "react";
import { getVersionString, isServerDownMode, getProgramMode } from "../utils/mode";
import {
  Folder,
  Upload,
  Download,
  ListFilter,
  Hash,
  Type,
  TrendingUp,
  History,
  Settings as SettingsIcon,
  RefreshCw,
  AlertTriangle,
  Shield,
  Eye,
  Minus,
  Plus,
  ZoomIn,
  ChevronDown,
  Check,
  ClipboardPaste,
} from "lucide-react";

interface MenuBarProps {
  onFileAction: (action: "load" | "export") => void;
  onSort: (
    type: "rank" | "byLastName" | "byFirstName" | "nRating" | "rating",
  ) => void;
  onRecalculateRatings: () => void;
  onCheckErrors: () => void;
  onToggleAdmin: () => void;
  onSetZoom: (level: "50%" | "70%" | "100%" | "140%" | "200%") => void;
  onOpenSettings: () => void;
  onAddPlayer?: () => void;
  onBulkPaste?: () => void;
  onEnterGames?: () => void;
  isAdmin: boolean;
  isWide: boolean;
  zoomLevel: "50%" | "70%" | "100%" | "140%" | "200%";
  projectName?: string;
  onProjectNameChange?: (name: string) => void;
  onSetTitle?: (title: string) => void;
  playerCount?: number;
  serverUrl?: string; // Server URL - if set without API key, admin mode is disabled
  hasAdminApiKey?: boolean; // If true and serverUrl is set, admin mode is enabled
}

interface MenuItem {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  dataMenuItem: string;
  hasCheckmark?: boolean;
}

export default function MenuBar({
  onFileAction,
  onSort,
  onRecalculateRatings,
  onCheckErrors,
  onToggleAdmin,
  onSetZoom,
  onOpenSettings,
  onAddPlayer,
  onBulkPaste,
  onEnterGames,
  isAdmin,
  zoomLevel,
  projectName,
  onProjectNameChange,
  onSetTitle,
  playerCount,
  serverUrl,
  hasAdminApiKey,
}: MenuBarProps) {
  // Admin mode is disabled if connected to server without admin API key
  // Enabled if: no server (local mode) OR has admin API key configured
  const adminModeDisabled = !!(serverUrl && serverUrl.trim() && !hasAdminApiKey);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isServerDown, setIsServerDown] = useState(false);

  // Track server down mode
  useEffect(() => {
    const checkMode = () => {
      setIsServerDown(getProgramMode() === 'server_down');
    };
    checkMode();
    const interval = setInterval(checkMode, 10000);
    return () => clearInterval(interval);
  }, []);

  const closeAllMenus = () => {
    setOpenMenu(null);
  };

  const toggleMenu = (menuName: string) => {
    setOpenMenu(openMenu === menuName ? null : menuName);
  };

  const fileMenuItems: MenuItem[] = [
    {
      icon: <Upload size={16} />,
      label: "Load",
      onClick: () => {
        onFileAction("load");
        closeAllMenus();
      },
      dataMenuItem: "Load",
    },
    {
      icon: <Download size={16} />,
      label: "Export",
      onClick: () => {
        onFileAction("export");
        closeAllMenus();
      },
      dataMenuItem: "Export",
    },
  ];

  const allTitles = [
    "Ladder",
    "Bughouse Ladder",
    "BG_Game",
    "Bishop_Game",
    "Pillar_Game",
    "Kings_Cross",
    "Pawn_Game",
    "Queen_Game",
  ];

  const titleMenuItems: MenuItem[] = allTitles.map((title) => ({
    icon: <Type size={16} />,
    label: title,
    onClick: () => {
      onSetTitle?.(title);
      closeAllMenus();
    },
    dataMenuItem: `Title-${title}`,
    hasCheckmark: projectName?.toLowerCase() === title.toLowerCase(),
  }));

  const sortMenuItems: MenuItem[] = [
    {
      icon: <Hash size={16} />,
      label: "By Rank",
      onClick: () => {
        onSort("rank");
        closeAllMenus();
      },
      dataMenuItem: "By Rank",
    },
    {
      icon: <Type size={16} />,
      label: "By Last Name",
      onClick: () => {
        onSort("byLastName");
        closeAllMenus();
      },
      dataMenuItem: "By Last Name",
    },
    {
      icon: <Type size={16} />,
      label: "By First Name",
      onClick: () => {
        onSort("byFirstName");
        closeAllMenus();
      },
      dataMenuItem: "By First Name",
    },
    {
      icon: <TrendingUp size={16} />,
      label: "By New Rating",
      onClick: () => {
        onSort("nRating");
        closeAllMenus();
      },
      dataMenuItem: "By New Rating",
    },
    {
      icon: <History size={16} />,
      label: "By Previous Rating",
      onClick: () => {
        onSort("rating");
        closeAllMenus();
      },
      dataMenuItem: "By Previous Rating",
    },
  ];

  const operationsMenuItems: MenuItem[] = [
    {
      icon: <RefreshCw size={16} />,
      label: "Recalculate_Save",
      onClick: () => {
        onRecalculateRatings();
        closeAllMenus();
      },
      dataMenuItem: "Recalculate_Save",
    },
    {
      icon: <AlertTriangle size={16} />,
      label: "Check Errors",
      onClick: () => {
        onCheckErrors();
        closeAllMenus();
      },
      dataMenuItem: "Check Errors",
    },
    {
      icon: <Type size={16} />,
      label: "Enter Games",
      onClick: () => {
        onEnterGames?.();
        closeAllMenus();
      },
      dataMenuItem: "Enter Games",
    },
    {
      icon: <ClipboardPaste size={16} />,
      label: "Paste Multiple Results",
      onClick: () => {
        onBulkPaste?.();
        closeAllMenus();
      },
      dataMenuItem: "Paste Multiple Results",
    },
    ...(!adminModeDisabled && onAddPlayer
      ? [
          {
            icon: <Plus size={16} />,
            label: "Add Player",
            onClick: () => {
              onAddPlayer();
              closeAllMenus();
            },
            dataMenuItem: "Add Player",
          },
        ]
      : []),
    ...(adminModeDisabled
      ? []
      : [
          {
            icon: <Shield size={16} />,
            label: isAdmin ? "Exit Admin Mode" : "Admin Mode",
            onClick: () => {
              onToggleAdmin();
              closeAllMenus();
            },
            dataMenuItem: isAdmin ? "Exit Admin Mode" : "Admin Mode",
          },
        ]),
    // Settings - always accessible, moved to bottom of Operations
    {
      icon: <SettingsIcon size={16} />,
      label: "Settings",
      onClick: () => {
        onOpenSettings();
        closeAllMenus();
      },
      dataMenuItem: "Settings",
    },
  ];

  const viewMenuItems: MenuItem[] = [
    {
      icon: <Minus size={16} />,
      label: "Zoom 50%",
      onClick: () => {
        onSetZoom("50%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 50%",
    },
    {
      icon: <Minus size={16} />,
      label: "Zoom 70%",
      onClick: () => {
        onSetZoom("70%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 70%",
    },
    {
      icon: <Eye size={16} />,
      label: "Zoom 100%",
      onClick: () => {
        onSetZoom("100%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 100%",
    },
    {
      icon: <Plus size={16} />,
      label: "Zoom 140%",
      onClick: () => {
        onSetZoom("140%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 140%",
    },
    {
      icon: <ZoomIn size={16} />,
      label: "Zoom 200%",
      onClick: () => {
        onSetZoom("200%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 200%",
    },
  ];

  const renderMenuItems = (items: MenuItem[], menuType?: string) => (
    <div role="menu" aria-label="Menu items">
      {items.map((item) => (
        <div
          key={item.dataMenuItem}
          data-menu-item={item.dataMenuItem}
          role="menuitem"
          tabIndex={0}
          onClick={item.onClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              item.onClick();
            }
          }}
          style={{
            padding: "0.75rem 1rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            color: "#374151",
            backgroundColor: "white",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#f1f5f9";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "white";
          }}
        >
          {item.icon}
          {menuType === "title" && item.hasCheckmark && (
            <Check size={14} style={{ marginLeft: "auto", color: "#3b82f6" }} />
          )}
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );

  const renderDropdown = (
    menuName: string,
    items: MenuItem[],
    menuType?: string,
  ) => {
    if (openMenu !== menuName) return null;

    const allItems =
      menuName === "File" ? [...items, ...titleMenuItems] : items;

    return (
      <div
        style={{
          position: "absolute",
          top: "100%",
          left: 0,
          backgroundColor: "white",
          border: "1px solid #e2e8f0",
          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
          minWidth: "200px",
          zIndex: 100,
          borderRadius: "0.25rem",
          overflow: "hidden",
        }}
      >
        {renderMenuItems(allItems, menuType)}
      </div>
    );
  };

  const renderMenuTrigger = (
    menuName: string,
    icon: React.ReactNode,
    items: MenuItem[],
    menuType?: string,
  ) => (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        data-menu={menuName}
        onClick={() => toggleMenu(menuName)}
        style={{
          background: openMenu === menuName ? "#334155" : "transparent",
          color: "white",
          border: "none",
          padding: "0.5rem 1rem",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          borderRadius: "0.25rem",
        }}
      >
        {icon}
        <span>{menuName}</span>
        <ChevronDown size={14} />
      </button>
      {renderDropdown(menuName, items, menuType)}
    </div>
  );

  const getFontSize = () => {
    switch (zoomLevel) {
      case "50%":
        return "0.5rem";
      case "70%":
        return "0.625rem";
      case "100%":
        return "0.875rem";
      case "140%":
        return "1.25rem";
      case "200%":
        return "1.75rem";
      default:
        return "0.875rem";
    }
  };

  return (
    <>
      <div
        onMouseLeave={closeAllMenus}
        style={{
          display: "flex",
          alignItems: "center",
          backgroundColor: "#1e293b",
          borderBottom: "1px solid #334155",
          fontSize: getFontSize(),
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            flex: 1,
          }}
        >
          {isAdmin && renderMenuTrigger(
            "File",
            <Folder size={16} />,
            fileMenuItems,
            "title",
          )}
          {isAdmin && renderMenuTrigger("Sort", <ListFilter size={16} />, sortMenuItems)}
          {renderMenuTrigger(
            "Operations",
            <SettingsIcon size={16} />,
            operationsMenuItems,
          )}
          {renderMenuTrigger("View", <ZoomIn size={16} />, viewMenuItems)}
        </div>

        {/* Title and player count */}
        {projectName && (
          <h1
            contentEditable={isAdmin && onProjectNameChange !== undefined}
            suppressContentEditableWarning={true}
            onBlur={(e) => {
              if (isAdmin && onProjectNameChange && e.target.textContent) {
                onProjectNameChange(e.target.textContent);
              }
            }}
            style={{
              margin: 0,
              color: "white",
              padding: "0 1rem",
              fontSize: "0.875rem",
              cursor:
                isAdmin && onProjectNameChange !== undefined
                  ? "text"
                  : "default",
              backgroundColor:
                isAdmin && onProjectNameChange !== undefined
                  ? "rgba(255, 255, 255, 0.1)"
                  : "transparent",
            }}
          >
            {projectName} {getVersionString()}
            {isServerDown && (
              <span style={{
                marginLeft: '0.5rem',
                padding: '0.25rem 0.5rem',
                backgroundColor: '#f59e0b',
                color: '#78350f',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
                fontWeight: '600',
              }}>
                ⚠️ SERVER DOWN
              </span>
            )}
          </h1>
        )}
        {playerCount !== undefined && (
          <div style={{ padding: "0.75rem 1rem", fontSize: "0.875rem" }}>
            <span style={{ color: "rgba(255, 255, 255, 0.7)" }}>
              Total Players
            </span>
            <div style={{ fontWeight: "600", color: "white" }}>
              {playerCount}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
