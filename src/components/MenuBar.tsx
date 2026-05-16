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
      icon: <Upload size={16} />,
      label: "Load",
      onClick: () => {
        onFileAction?.("load");
        closeAllMenus();
      },
      dataMenuItem: "Load",
      disabled: !isAdmin || tournamentMode,
    },
    {
      icon: <Download size={16} />,
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
      icon: <Type size={16} />,
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
      icon: <Hash size={16} />,
      label: "By Rank",
      onClick: () => {
        onSort?.("rank");
        closeAllMenus();
      },
      dataMenuItem: "By Rank",
    },
    {
      icon: <Type size={16} />,
      label: "By Last Name",
      onClick: () => {
        onSort?.("byLastName");
        closeAllMenus();
      },
      dataMenuItem: "By Last Name",
    },
    {
      icon: <Type size={16} />,
      label: "By First Name",
      onClick: () => {
        onSort?.("byFirstName");
        closeAllMenus();
      },
      dataMenuItem: "By First Name",
    },
    {
      icon: <TrendingUp size={16} />,
      label: "By New Rating",
      onClick: () => {
        onSort?.("nRating");
        closeAllMenus();
      },
      dataMenuItem: "By New Rating",
    },
    {
      icon: <History size={16} />,
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
      icon: <RefreshCw size={16} />,
      label: "Recalculate_Save",
      onClick: () => {
        onRecalculateRatings?.();
        closeAllMenus();
      },
      dataMenuItem: "Recalculate_Save",
      disabled: !writePermission,
    },
    {
      icon: <AlertTriangle size={16} />,
      label: "Check Errors",
      onClick: () => {
        onCheckErrors?.();
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
      disabled: !writePermission,
    },
    {
      icon: <ClipboardPaste size={16} />,
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
            icon: <Plus size={16} />,
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
             icon: <Trash2 size={16} />,
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
             icon: <Type size={16} />,
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
          icon: <Shield size={16} />,
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
            icon: <History size={16} />,
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
      icon: <SettingsIcon size={16} />,
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
      icon: <Minus size={16} />,
      label: "Zoom 50%",
      onClick: () => {
        onSetZoom?.("50%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 50%",
    },
    {
      icon: <Minus size={16} />,
      label: "Zoom 70%",
      onClick: () => {
        onSetZoom?.("70%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 70%",
    },
    {
      icon: <Eye size={16} />,
      label: "Zoom 100%",
      onClick: () => {
        onSetZoom?.("100%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 100%",
    },
    {
      icon: <Plus size={16} />,
      label: "Zoom 140%",
      onClick: () => {
        onSetZoom?.("140%");
        closeAllMenus();
      },
      dataMenuItem: "Zoom 140%",
    },
    {
      icon: <ZoomIn size={16} />,
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
            padding: "0.75rem 1rem",
            cursor: item.disabled ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            color: item.disabled ? "#9ca3af" : "#374151",
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

  return (
    <>
      <div
        onMouseLeave={closeAllMenus}
        style={{
          display: "flex",
          alignItems: "center",
          backgroundColor: tournamentMode ? "#166534" : !writePermission ? "#1e40af" : "#1e293b",
          borderBottom: "1px solid #334155",
          fontSize: getFontSize(zoomLevel),
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            flex: 1,
          }}
        >
          {renderMenuTrigger(
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
            style={{
              margin: 0,
              color: "white",
              padding: "0 1rem",
              fontSize: "0.875rem",
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
