import { useState, useEffect } from "react";
import { getVersionString, getProgramMode } from "../utils/mode";
import { getVisibleTitles } from "../utils/titleMenu";
import { getFontSize, getScaledPadding, getScaledGap } from "../utils/getFontSize";
import { useIntervalCheck } from "../utils/useIntervalCheck";
import { titleToFileName, LADDER_SHORTCUTS, LADDER_COLORS } from "../../shared/utils/constants";
import { debugClick } from "../utils/debug";
import { useTooltips } from "../hooks/useTooltips";
import {
  Folder,
  Upload,
  Download,
  ListFilter,
  Hash,
  Type,
  Printer,
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
  Trash2,
} from "lucide-react";

interface MenuBarProps {
  onFileAction?: (action: "load" | "export") => void;
  onSort?: (sortType: "rank" | "byLastName" | "byFirstName" | "nRating" | "rating") => void;
  onRecalculateRatings?: () => void;
  onCheckErrors?: () => void;
  onToggleAdmin?: () => void;
  onSetZoom?: (level: "50%" | "70%" | "100%" | "140%" | "200%") => void;
  onOpenSettings?: () => void;
  onAddPlayer?: () => void;
  onBulkPaste?: () => void;
  onEnterGames?: () => void;
  onRestoreBackup?: () => void;
  onDeleteHiddenPlayers?: () => void;
  onAutoLetter?: () => void;
  onPrintLabels?: () => void;
  showRoundRobin?: boolean;
  onToggleRoundRobin?: () => void;
  isAdmin: boolean;
  zoomLevel: "50%" | "70%" | "100%" | "140%" | "200%";
  projectName?: string;
  onSetTitle?: (title: string) => void;
  playerCount?: number;
  serverUrl?: string | null;
  hasAdminApiKey?: boolean;
  miniGamesHaveResults?: boolean;
  availableMiniGames?: string[];
  writePermission?: boolean;
}

interface MenuItem {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  dataMenuItem: string;
  hasCheckmark?: boolean;
  disabled?: boolean;
  shortcut?: string;
  color?: string;
  tooltip?: string;
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
  onRestoreBackup,
  onDeleteHiddenPlayers,
  onAutoLetter,
  onPrintLabels,
  showRoundRobin = false,
  onToggleRoundRobin,
  isAdmin,
  zoomLevel,
  projectName,
  onSetTitle,
  playerCount,
  serverUrl,
  hasAdminApiKey = false,
  miniGamesHaveResults = false,
  availableMiniGames = [],
  writePermission = true,
}: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isServerDown, setIsServerDown] = useState(false);
  const { title: tt } = useTooltips();

  // Track server down mode
  const isServerDownValue = useIntervalCheck(() => getProgramMode() === 'server_down', 10000);

  useEffect(() => {
    setIsServerDown(isServerDownValue);
  }, [isServerDownValue]);

  const closeAllMenus = () => {
    setOpenMenu(null);
  };

  const toggleMenu = (menuName: string) => {
    debugClick(`Menu:${menuName}`);
    setOpenMenu(openMenu === menuName ? null : menuName);
  };

  // tooltip.md: [Menu Bar] File Menu Items
  const fileMenuItems: MenuItem[] = [
    {
      icon: <Upload size={16} />,
      label: "Load",
      onClick: () => {
        debugClick("Load");
        onFileAction?.("load");
        closeAllMenus();
      },
      dataMenuItem: "Load",
      disabled: !isAdmin || miniGamesHaveResults,
      tooltip: tt("Load a new .tab file to replace current ladder data"),
    },
    {
      icon: <Download size={16} />,
      label: "Export",
      onClick: () => {
        debugClick("Export");
        onFileAction?.("export");
        closeAllMenus();
      },
      dataMenuItem: "Export",
      tooltip: tt("Download current ladder data as a .tab file"),
    },
    ];

  const visibleTitles = getVisibleTitles(isAdmin, availableMiniGames);

  // tooltip.md: [Menu Bar] Title Menu Items
  const titleMenuItems: MenuItem[] = visibleTitles
    .sort((a, b) => (LADDER_SHORTCUTS?.[a] ?? 99) - (LADDER_SHORTCUTS?.[b] ?? 99))
    .map((title) => {
      const isMiniGame = title !== "Ladder";
      const fileName = isMiniGame ? titleToFileName(title) : null;
      const isAvailable = fileName ? availableMiniGames.includes(fileName) : true;
      const isDisabled = !isAdmin && isMiniGame && !isAvailable;
      const shortcutNum = LADDER_SHORTCUTS?.[title];
      
      return {
        icon: <Type size={16} />,
        label: title,
        color: LADDER_COLORS[title],
        shortcut: shortcutNum ? `Ctrl+${shortcutNum}` : undefined,
        tooltip: tt(title === "Ladder" ? "Main club ladder (ladder.tab)" : `Switch to mini-game tournament: ${title}`),
        onClick: () => {
          if (isDisabled) {
            alert(`"${title}" is not available yet. Only admin can create mini-games.`);
            return;
          }
          debugClick(`Title:${title}`);
          onSetTitle?.(title);
          closeAllMenus();
        },
        dataMenuItem: `Title-${title}`,
        hasCheckmark: projectName?.toLowerCase() === title.toLowerCase(),
        disabled: isDisabled,
      };
    });

  // tooltip.md: [Menu Bar] Sort Menu Items
  const sortMenuItems: MenuItem[] = [
    {
      icon: <Hash size={16} />,
      label: "By Rank",
      onClick: () => {
        debugClick("Sort:By Rank");
        onSort?.("rank");
        closeAllMenus();
      },
      dataMenuItem: "By Rank",
      tooltip: tt("Sort by current rank order"),
    },
    {
      icon: <Type size={16} />,
      label: "By Last Name",
      onClick: () => {
        debugClick("Sort:By Last Name");
        onSort?.("byLastName");
        closeAllMenus();
      },
      dataMenuItem: "By Last Name",
      tooltip: tt("Sort alphabetically by last name"),
    },
    {
      icon: <Type size={16} />,
      label: "By First Name",
      onClick: () => {
        debugClick("Sort:By First Name");
        onSort?.("byFirstName");
        closeAllMenus();
      },
      dataMenuItem: "By First Name",
      tooltip: tt("Sort alphabetically by first name"),
    },
    {
      icon: <TrendingUp size={16} />,
      label: "By New Rating",
      onClick: () => {
        debugClick("Sort:By New Rating");
        onSort?.("nRating");
        closeAllMenus();
      },
      dataMenuItem: "By New Rating",
      tooltip: tt("Sort by calculated new rating (high to low)"),
    },
    {
      icon: <History size={16} />,
      label: "By Previous Rating",
      onClick: () => {
        debugClick("Sort:By Previous Rating");
        onSort?.("rating");
        closeAllMenus();
      },
      dataMenuItem: "By Previous Rating",
      tooltip: tt("Sort by previous rating (high to low)"),
    },
  ];

  // tooltip.md: [Menu Bar] Operations Menu Items
  const operationsMenuItems: MenuItem[] = [
    {
      icon: <RefreshCw size={16} />,
      label: "Recalculate_Save",
      onClick: () => {
        debugClick("Recalculate_Save");
        onRecalculateRatings?.();
        closeAllMenus();
      },
      dataMenuItem: "Recalculate_Save",
      disabled: !writePermission,
      tooltip: tt("Recalculate all ratings from game results and save (Ctrl+E)"),
    },
    {
      icon: <AlertTriangle size={16} />,
      label: "Check Errors",
      onClick: () => {
        debugClick("Check Errors");
        onCheckErrors?.();
        closeAllMenus();
      },
      dataMenuItem: "Check Errors",
      tooltip: tt("Check for data entry errors in game results"),
    },
    {
      icon: <Type size={16} />,
      label: "Enter Games",
      onClick: () => {
        debugClick("Enter Games");
        onEnterGames?.();
        closeAllMenus();
      },
      dataMenuItem: "Enter Games",
      disabled: !writePermission,
      tooltip: tt("Enter or correct game results (Ctrl+E)"),
    },
    {
      icon: <ClipboardPaste size={16} />,
      label: "Paste Multiple Results",
      onClick: () => {
        debugClick("Paste Multiple Results");
        onBulkPaste?.();
        closeAllMenus();
      },
      dataMenuItem: "Paste Multiple Results",
      disabled: !writePermission,
      tooltip: tt("Paste multiple game results from clipboard at once"),
    },
    ...(isAdmin && onAddPlayer
      ? [
          {
            icon: <Plus size={16} />,
            label: "Add Player",
            onClick: () => {
              debugClick("Add Player");
              onAddPlayer?.();
              closeAllMenus();
            },
            dataMenuItem: "Add Player",
            disabled: !writePermission,
            tooltip: tt("Add a new player to the ladder"),
          },
        ]
      : []),
    ...(isAdmin && onDeleteHiddenPlayers
       ? [
           {
             icon: <Trash2 size={16} />,
             label: "Delete Players",
             onClick: () => {
               debugClick("Delete Hidden Players");
               onDeleteHiddenPlayers?.();
               closeAllMenus();
             },
             dataMenuItem: "Delete Hidden Players",
             disabled: !writePermission,
             tooltip: tt("Delete hidden players (group ending in X)"),
           },
         ]
       : []),
      ...(isAdmin && onAutoLetter
       ? [
           {
             icon: <Type size={16} />,
             label: "Auto-Letter",
             onClick: () => {
               debugClick("Auto-Letter");
               onAutoLetter?.();
               closeAllMenus();
             },
             dataMenuItem: "Auto-Letter",
             disabled: !writePermission,
             tooltip: tt("Auto-generate tournament letters for players"),
           },
         ]
       : []),
    ...(serverUrl && !hasAdminApiKey && !isAdmin
      ? []
      : [{
          icon: <Shield size={16} />,
          label: isAdmin ? "Exit Admin Mode" : "Admin Mode",
          onClick: () => {
            debugClick(isAdmin ? "Exit Admin Mode" : "Admin Mode");
            onToggleAdmin?.();
            closeAllMenus();
          },
          dataMenuItem: isAdmin ? "Exit Admin Mode" : "Admin Mode",
          disabled: !writePermission && !isAdmin,
          tooltip: tt("Toggle admin mode for write access"),
        }]),
    // tooltip.md: [Menu Bar] Operations Menu Items
    ...(isAdmin && onRestoreBackup
      ? [
          {
            icon: <History size={16} />,
            label: "Restore Backup",
            onClick: () => {
              debugClick("Restore Backup");
              onRestoreBackup?.();
              closeAllMenus();
            },
            dataMenuItem: "Restore Backup",
            disabled: !writePermission,
            tooltip: tt("Restore ladder data from a previous backup"),
          },
        ]
      : []),
    ...(isAdmin && onPrintLabels
      ? [
          {
            icon: <Printer size={16} />,
            label: "Print Labels",
            onClick: () => {
              debugClick("Print Labels");
              onPrintLabels();
              closeAllMenus();
            },
            dataMenuItem: "Print Labels",
            tooltip: tt("Print player labels for tournaments"),
          },
        ]
      : []),
    // tooltip.md: [Menu Bar] Operations Menu Items
    {
      icon: <SettingsIcon size={16} />,
      label: "Settings",
      onClick: () => {
        debugClick("Settings");
        onOpenSettings?.();
        closeAllMenus();
      },
      dataMenuItem: "Settings",
      tooltip: tt("Open settings dialog (K-factor, debug level, server config)"),
    },
  ];

  // tooltip.md: [Menu Bar] View Menu Items
  const viewMenuItems: MenuItem[] = [
    {
      icon: <Minus size={16} />,
      label: "Zoom 50%",
      onClick: () => {
        debugClick("Zoom 50%");
        onSetZoom?.("50%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 50%",
      tooltip: tt("Set table zoom to 50%"),
    },
    {
      icon: <Minus size={16} />,
      label: "Zoom 70%",
      onClick: () => {
        debugClick("Zoom 70%");
        onSetZoom?.("70%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 70%",
      tooltip: tt("Set table zoom to 70%"),
    },
    {
      icon: <Eye size={16} />,
      label: "Zoom 100%",
      onClick: () => {
        debugClick("Zoom 100%");
        onSetZoom?.("100%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 100%",
      tooltip: tt("Set table zoom to 100% (default)"),
    },
    {
      icon: <Plus size={16} />,
      label: "Zoom 140%",
      onClick: () => {
        debugClick("Zoom 140%");
        onSetZoom?.("140%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 140%",
      tooltip: tt("Set table zoom to 140%"),
    },
    {
      icon: <ZoomIn size={16} />,
      label: "Zoom 200%",
      onClick: () => {
        debugClick("Zoom 200%");
        onSetZoom?.("200%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 200%",
      tooltip: tt("Set table zoom to 200%"),
    },
    {
      icon: <span style={{ fontWeight: "bold", fontSize: "14px" }}>R</span>,
      label: "Round Robin",
      onClick: () => {
        debugClick("Round Robin");
        onToggleRoundRobin?.();
      },
      dataMenuItem: "Round Robin",
      hasCheckmark: showRoundRobin,
      tooltip: tt("Toggle round-robin view showing matchups"),
    },
  ];

  const renderMenuItems = (items: MenuItem[], menuType?: string) => (
    <div role="menu" aria-label="Menu items">
      {items.map((item) => (
        <div
          key={item.dataMenuItem}
          data-menu-item={item.dataMenuItem}
          role="menuitem"
          tabIndex={item.disabled ? -1 : 0}
          title={item.tooltip}
          onClick={item.onClick}
          onKeyDown={(e) => {
            if (!item.disabled && (e.key === "Enter" || e.key === " ")) {
              item.onClick();
            }
          }}
          style={{
            padding: getScaledPadding(zoomLevel, 0.75, 1),
            cursor: item.disabled ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: getScaledGap(zoomLevel, 0.75),
            color: item.disabled ? "#9ca3af" : (item.color || "#374151"),
            backgroundColor: "white",
            opacity: item.disabled ? 0.5 : 1,
            fontStyle: item.disabled ? "italic" : "normal",
          }}
          onMouseEnter={(e) => {
            if (!item.disabled) {
              e.currentTarget.style.backgroundColor = "#f1f5f9";
            }
          }}
          onMouseLeave={(e) => {
            if (!item.disabled) {
              e.currentTarget.style.backgroundColor = "white";
            }
          }}
        >
          {item.icon}
          {(menuType === "title" || menuType === "view") && item.hasCheckmark && (
            <Check size={14} style={{ color: "#3b82f6" }} />
          )}
          <span style={{ flex: 1 }}>{item.label}</span>
          {item.disabled && (
            <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
              (not available)
            </span>
          )}
          {item.shortcut && (
            <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "#9ca3af", whiteSpace: "nowrap" }}>
              {item.shortcut}
            </span>
          )}
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

  // tooltip.md: [Menu Bar] Menu Triggers
  const menuTriggerTooltips: Record<string, string | undefined> = {
    File: tt("Load or export ladder data"),
    Sort: tt("Sort players by different criteria"),
    Operations: tt("Recalculate, enter games, manage players, and more"),
    View: tt("Adjust zoom level and view options"),
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
          title={menuTriggerTooltips[menuName]}
          style={{
            background: openMenu === menuName ? "#334155" : "transparent",
            color: "white",
            border: "none",
            padding: getScaledPadding(zoomLevel, 0.5, 1),
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: getScaledGap(zoomLevel, 0.5),
            borderRadius: "0.25rem",
            fontSize: getFontSize(zoomLevel),
          }}
        >
        {icon}
        <span>{menuName}</span>
        <ChevronDown size={14} />
      </button>
      {renderDropdown(menuName, items, menuType)}
    </div>
  );

  return (
    <>
      <div
        onMouseLeave={closeAllMenus}
        style={{
          display: "flex",
          alignItems: "center",
          background: miniGamesHaveResults ? "linear-gradient(135deg, #166534 0%, #22c55e 100%)"
            : !writePermission ? "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)"
            : "linear-gradient(135deg, #0f172a 0%, #334155 100%)",
          borderBottom: "1px solid #334155",
          fontSize: getFontSize(zoomLevel),
        }}
      >
        <div
          style={{
            display: "flex",
            gap: getScaledGap(zoomLevel, 0.5),
            flex: 1,
          }}
        >
          {renderMenuTrigger(
            "File",
            <Folder size={16} />,
            fileMenuItems,
            "title",
          )}
          {renderMenuTrigger("Sort", <ListFilter size={16} />, sortMenuItems)}
          {renderMenuTrigger(
            "Operations",
            <SettingsIcon size={16} />,
            operationsMenuItems,
          )}
          {renderMenuTrigger("View", <ZoomIn size={16} />, viewMenuItems, "view")}
        </div>

        {/* Title and player count */}
        {projectName && (
          <h1
            style={{
              margin: 0,
              color: "white",
              padding: getScaledPadding(zoomLevel, 0, 1),
              fontSize: getFontSize(zoomLevel),
            }}
          >
            {projectName} {getVersionString()}
            {/* tooltip.md: [Status Banner] SERVER DOWN */}
            {isServerDown && (
              <span
                title={tt("Connection to server is lost. Working with local data.")}
                style={{
                  marginLeft: getScaledGap(zoomLevel, 0.5),
                  padding: getScaledPadding(zoomLevel, 0.25, 0.5),
                  backgroundColor: '#f59e0b',
                  color: '#78350f',
                  borderRadius: '0.25rem',
                  fontSize: getFontSize(zoomLevel),
                  fontWeight: '600',
                }}
              >
                ⚠️ SERVER DOWN
              </span>
            )}
          </h1>
        )}
        {/* tooltip.md: [Menu Bar] Menu Bar Info */}
        {playerCount !== undefined && (
          <div
            title={tt("Number of players currently loaded")}
            style={{ padding: getScaledPadding(zoomLevel, 0.75, 1), display: "flex", alignItems: "baseline", gap: "0.5rem" }}
          >
            <span style={{ color: "rgba(255, 255, 255, 0.7)" }}>
              Total Players
            </span>
            <span style={{ fontWeight: "600", color: "white" }}>
              {playerCount}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
