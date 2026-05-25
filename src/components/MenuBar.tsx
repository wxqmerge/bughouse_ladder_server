import { useState, useEffect } from "react";
import { getVersionString, getProgramMode } from "../utils/mode";
import { getVisibleTitles } from "../utils/titleMenu";
import { getFontSize } from "../utils/getFontSize";
import { useIntervalCheck } from "../utils/useIntervalCheck";
import { titleToFileName } from "../utils/constants";
import {
  Folder,
  Upload,
  Download,
  ListFilter,
  Hash,
  Type,
  TrendingUp,
  Archive,
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
  isAdmin: boolean;
  zoomLevel: "50%" | "70%" | "100%" | "140%" | "200%";
  projectName?: string;
  onSetTitle?: (title: string) => void;
  playerCount?: number;
  serverUrl?: string | null;
  hasAdminApiKey?: boolean;
  tournamentMode?: boolean;
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
  isAdmin,
  zoomLevel,
  projectName,
  onSetTitle,
  playerCount,
  serverUrl,
  hasAdminApiKey = false,
  tournamentMode = false,
  availableMiniGames = [],
  writePermission = true,
}: MenuBarProps) {
  const zoomScale = parseInt(zoomLevel, 10) / 100;
  const serverConfigured = !!(serverUrl && serverUrl.trim());
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isServerDown, setIsServerDown] = useState(false);

  // Track server down mode
  const isServerDownValue = useIntervalCheck(() => getProgramMode() === 'server_down', 10000);

  useEffect(() => {
    setIsServerDown(isServerDownValue);
  }, [isServerDownValue]);

  const closeAllMenus = () => {
    setOpenMenu(null);
  };

  const toggleMenu = (menuName: string) => {
    setOpenMenu(openMenu === menuName ? null : menuName);
  };

  const fileMenuItems: MenuItem[] = [
    {
      icon: <Upload size={Math.round(16 * zoomScale)} />,
      label: "Load",
      onClick: () => {
        onFileAction?.("load");
        closeAllMenus();
      },
      dataMenuItem: "Load",
      disabled: !isAdmin || tournamentMode,
    },
    {
      icon: <Download size={Math.round(16 * zoomScale)} />,
      label: "Export",
      onClick: () => {
        onFileAction?.("export");
        closeAllMenus();
      },
      dataMenuItem: "Export",
    },
    ];

  const visibleTitles = getVisibleTitles(isAdmin, availableMiniGames);

  const titleMenuItems: MenuItem[] = visibleTitles.map((title) => {
    const isMiniGame = title !== "Ladder";
    const fileName = isMiniGame ? titleToFileName(title) : null;
    const isAvailable = fileName ? availableMiniGames.includes(fileName) : true;
    const isDisabled = !isAdmin && isMiniGame && !isAvailable;
    
    return {
      icon: <Type size={Math.round(16 * zoomScale)} />,
      label: title,
      onClick: () => {
        if (isDisabled) {
          alert(`"${title}" is not available yet. Only admin can create mini-games.`);
          return;
        }
        onSetTitle?.(title);
        closeAllMenus();
      },
      dataMenuItem: `Title-${title}`,
      hasCheckmark: projectName?.toLowerCase() === title.toLowerCase(),
      disabled: isDisabled,
    };
  });

  const sortMenuItems: MenuItem[] = [
    {
      icon: <Hash size={Math.round(16 * zoomScale)} />,
      label: "By Rank",
      onClick: () => {
        onSort?.("rank");
        closeAllMenus();
      },
      dataMenuItem: "By Rank",
    },
    {
      icon: <Type size={Math.round(16 * zoomScale)} />,
      label: "By Last Name",
      onClick: () => {
        onSort?.("byLastName");
        closeAllMenus();
      },
      dataMenuItem: "By Last Name",
    },
    {
      icon: <Type size={Math.round(16 * zoomScale)} />,
      label: "By First Name",
      onClick: () => {
        onSort?.("byFirstName");
        closeAllMenus();
      },
      dataMenuItem: "By First Name",
    },
    {
      icon: <TrendingUp size={Math.round(16 * zoomScale)} />,
      label: "By New Rating",
      onClick: () => {
        onSort?.("nRating");
        closeAllMenus();
      },
      dataMenuItem: "By New Rating",
    },
    {
      icon: <History size={Math.round(16 * zoomScale)} />,
      label: "By Previous Rating",
      onClick: () => {
        onSort?.("rating");
        closeAllMenus();
      },
      dataMenuItem: "By Previous Rating",
    },
  ];

 const operationsMenuItems: MenuItem[] = [
    {
      icon: <RefreshCw size={Math.round(16 * zoomScale)} />,
      label: "Recalculate_Save",
      onClick: () => {
        onRecalculateRatings?.();
        closeAllMenus();
      },
      dataMenuItem: "Recalculate_Save",
      disabled: !writePermission,
    },
    {
      icon: <AlertTriangle size={Math.round(16 * zoomScale)} />,
      label: "Check Errors",
      onClick: () => {
        onCheckErrors?.();
        closeAllMenus();
      },
      dataMenuItem: "Check Errors",
    },
    {
      icon: <Type size={Math.round(16 * zoomScale)} />,
      label: "Enter Games",
      onClick: () => {
        onEnterGames?.();
        closeAllMenus();
      },
      dataMenuItem: "Enter Games",
      disabled: !writePermission,
    },
    {
      icon: <ClipboardPaste size={Math.round(16 * zoomScale)} />,
      label: "Paste Multiple Results",
      onClick: () => {
        onBulkPaste?.();
        closeAllMenus();
      },
      dataMenuItem: "Paste Multiple Results",
      disabled: !writePermission,
    },
    ...(isAdmin && onAddPlayer
      ? [
          {
            icon: <Plus size={Math.round(16 * zoomScale)} />,
            label: "Add Player",
            onClick: () => {
              onAddPlayer?.();
              closeAllMenus();
            },
            dataMenuItem: "Add Player",
            disabled: !writePermission,
          },
        ]
      : []),
    ...(isAdmin && onDeleteHiddenPlayers
       ? [
           {
             icon: <Trash2 size={Math.round(16 * zoomScale)} />,
             label: "Delete Hidden Players",
             onClick: () => {
               onDeleteHiddenPlayers?.();
               closeAllMenus();
             },
             dataMenuItem: "Delete Hidden Players",
             disabled: !writePermission,
           },
         ]
       : []),
      ...(isAdmin && onAutoLetter
       ? [
           {
             icon: <Type size={Math.round(16 * zoomScale)} />,
             label: "Auto-Letter",
             onClick: () => {
               onAutoLetter?.();
               closeAllMenus();
             },
             dataMenuItem: "Auto-Letter",
             disabled: !writePermission,
           },
         ]
       : []),
    ...(serverUrl && !hasAdminApiKey && !isAdmin
      ? []
      : [{
          icon: <Shield size={Math.round(16 * zoomScale)} />,
          label: isAdmin ? "Exit Admin Mode" : "Admin Mode",
          onClick: () => {
            onToggleAdmin?.();
            closeAllMenus();
          },
          dataMenuItem: isAdmin ? "Exit Admin Mode" : "Admin Mode",
          disabled: !writePermission && !isAdmin,
        }]),
    // Restore Backup - admin only, before Settings
    ...(isAdmin && onRestoreBackup
      ? [
          {
            icon: <History size={Math.round(16 * zoomScale)} />,
            label: "Restore Backup",
            onClick: () => {
              onRestoreBackup?.();
              closeAllMenus();
            },
            dataMenuItem: "Restore Backup",
            disabled: !writePermission,
          },
        ]
      : []),
    // Settings - always accessible, moved to bottom of Operations
    {
      icon: <SettingsIcon size={Math.round(16 * zoomScale)} />,
      label: "Settings",
      onClick: () => {
        onOpenSettings?.();
        closeAllMenus();
      },
      dataMenuItem: "Settings",
    },
  ];

  const viewMenuItems: MenuItem[] = [
    {
      icon: <Minus size={Math.round(16 * zoomScale)} />,
      label: "Zoom 50%",
      onClick: () => {
        onSetZoom?.("50%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 50%",
    },
    {
      icon: <Minus size={Math.round(16 * zoomScale)} />,
      label: "Zoom 70%",
      onClick: () => {
        onSetZoom?.("70%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 70%",
    },
    {
      icon: <Eye size={Math.round(16 * zoomScale)} />,
      label: "Zoom 100%",
      onClick: () => {
        onSetZoom?.("100%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 100%",
    },
    {
      icon: <Plus size={Math.round(16 * zoomScale)} />,
      label: "Zoom 140%",
      onClick: () => {
        onSetZoom?.("140%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 140%",
    },
    {
      icon: <ZoomIn size={Math.round(16 * zoomScale)} />,
      label: "Zoom 200%",
      onClick: () => {
        onSetZoom?.("200%");
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
          tabIndex={item.disabled ? -1 : 0}
          onClick={item.onClick}
          onKeyDown={(e) => {
            if (!item.disabled && (e.key === "Enter" || e.key === " ")) {
              item.onClick();
            }
          }}
          style={{
            padding: "0.5em 1em",
            cursor: item.disabled ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5em",
            color: item.disabled ? "#9ca3af" : "#374151",
            backgroundColor: "white",
            opacity: item.disabled ? 0.5 : 1,
            fontStyle: item.disabled ? "italic" : "normal",
            fontSize: "inherit",
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
          {menuType === "title" && item.hasCheckmark && (
            <Check size={14} style={{ marginLeft: "auto", color: "#3b82f6" }} />
          )}
          <span>{item.label}</span>
          {item.disabled && (
            <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#9ca3af" }}>
              (not available)
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
          padding: "0.3em 0.8em",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "0.5em",
          borderRadius: "0.25rem",
          fontSize: "inherit",
        }}
      >
        {icon}
        <span>{menuName}</span>
        <ChevronDown size={Math.round(14 * zoomScale)} />
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
          backgroundColor: tournamentMode ? "#166534" : !writePermission ? "#1e40af" : "#1e293b",
          borderBottom: "1px solid #334155",
          fontSize: `${0.875 * ((100 + parseInt(zoomLevel, 10)) / 200)}rem`,
        }}
      >
        <div
          style={{
            display: "flex",
         gap: "0.5em",
            flex: 1,
          }}
        >
          {renderMenuTrigger(
            "File",
            <Folder size={Math.round(16 * zoomScale)} />,
            fileMenuItems,
            "title",
          )}
          {renderMenuTrigger("Sort", <ListFilter size={Math.round(16 * zoomScale)} />, sortMenuItems)}
          {renderMenuTrigger(
            "Operations",
            <SettingsIcon size={Math.round(16 * zoomScale)} />,
            operationsMenuItems,
          )}
          {renderMenuTrigger("View", <ZoomIn size={Math.round(16 * zoomScale)} />, viewMenuItems)}
        </div>

        {/* Title and player count */}
        {projectName && (
          <h1
            style={{
              margin: 0,
              color: "white",
              padding: "0 1em",
              fontSize: `${0.875 * ((100 + parseInt(zoomLevel, 10)) / 200)}rem`,
            }}
          >
            {projectName} {getVersionString()}
            {isServerDown && (
              <span style={{
                marginLeft: '0.5em',
                padding: '0.2em 0.4em',
                backgroundColor: '#f59e0b',
                color: '#78350f',
                borderRadius: '0.2em',
                fontSize: '0.85em',
                fontWeight: '600',
              }}>
                ⚠️ SERVER DOWN
              </span>
            )}
          </h1>
        )}
        {playerCount !== undefined && (
          <div style={{ padding: "0 1em", fontSize: `${0.875 * ((100 + parseInt(zoomLevel, 10)) / 200)}rem` }}>
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
