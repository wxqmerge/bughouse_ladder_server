import {
  X,
  Folder,
  ListFilter,
  Settings as SettingsIcon,
  Eye,
  Type,
  Check,
  Printer,
} from "lucide-react";
import { getVisibleTitles } from "../utils/titleMenu";
import { titleToFileName, LADDER_COLORS } from "../../shared/utils/constants";
import { debugClick } from "../utils/debug";
import { useTooltips } from "../hooks/useTooltips";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
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
  onRestoreBackup?: () => void;
  onDeleteHiddenPlayers?: () => void;
  onAutoLetter?: () => void;
  onPrintLabels?: () => void;
  isAdmin: boolean;
  miniGamesHaveResults?: boolean;
  projectName?: string;
  onSetTitle?: (title: string) => void;
  availableMiniGames?: string[];
  writePermission?: boolean;
  serverUrl?: string;
  hasAdminApiKey?: boolean;
}

interface MenuItem {
  label: string;
  onClick: () => void;
  dataMenuItem: string;
  hasCheckmark?: boolean;
  disabled?: boolean;
  color?: string;
  tooltip?: string;
}

export default function MobileMenu({
  isOpen,
  onClose,
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
  isAdmin,
  miniGamesHaveResults = false,
  projectName,
  onSetTitle,
  availableMiniGames = [],
  writePermission = true,
  serverUrl,
  hasAdminApiKey = false,
}: MobileMenuProps) {
  const { title: tt } = useTooltips();

  if (!isOpen) return null;

  const handleItemClick = (label: string, onClick: () => void) => {
    debugClick(`Mobile:${label}`);
    onClick();
    onClose();
  };

  // tooltip.md: [Mobile Menu] File Menu Items
  const fileItems: MenuItem[] = [
    {
      label: "Load",
      onClick: () => handleItemClick("Load", () => onFileAction("load")),
      dataMenuItem: "Load",
      disabled: !isAdmin || miniGamesHaveResults,
      tooltip: tt("Load a new .tab file to replace current ladder data"),
    },
    {
      label: "Export",
      onClick: () => handleItemClick("Export", () => onFileAction("export")),
      dataMenuItem: "Export",
      tooltip: tt("Download current ladder data as a .tab file"),
    },
  ];

  const visibleTitles = getVisibleTitles(isAdmin, availableMiniGames);

  // tooltip.md: [Mobile Menu] Title Menu Items
  const titleItems: MenuItem[] = visibleTitles.map((title) => {
    const isMiniGame = title !== "Ladder";
    const fileName = isMiniGame ? titleToFileName(title) : null;
    const isAvailable = fileName ? availableMiniGames.includes(fileName) : true;
    const isDisabled = !isAdmin && isMiniGame && !isAvailable;
    
    return {
      label: title,
      color: LADDER_COLORS[title],
      tooltip: tt(title === "Ladder" ? "Main club ladder (ladder.tab)" : `Switch to mini-game tournament: ${title}`),
      onClick: () => {
        if (isDisabled) {
          alert(`"${title}" is not available yet. Only admin can create mini-games.`);
          return;
        }
        handleItemClick(`Title:${title}`, () => onSetTitle?.(title));
      },
      dataMenuItem: `Title-${title}`,
      hasCheckmark: projectName?.toLowerCase() === title.toLowerCase(),
      disabled: isDisabled,
    };
  });

  // tooltip.md: [Mobile Menu] Sort Menu Items
  const sortItems: MenuItem[] = [
    {
      label: "By Rank",
      onClick: () => handleItemClick("Sort:By Rank", () => onSort("rank")),
      dataMenuItem: "By Rank",
      tooltip: tt("Sort by current rank order"),
    },
    {
      label: "By Last Name",
      onClick: () => handleItemClick("Sort:By Last Name", () => onSort("byLastName")),
      dataMenuItem: "By Last Name",
      tooltip: tt("Sort alphabetically by last name"),
    },
    {
      label: "By First Name",
      onClick: () => handleItemClick("Sort:By First Name", () => onSort("byFirstName")),
      dataMenuItem: "By First Name",
      tooltip: tt("Sort alphabetically by first name"),
    },
    {
      label: "By New Rating",
      onClick: () => handleItemClick("Sort:By New Rating", () => onSort("nRating")),
      dataMenuItem: "By New Rating",
      tooltip: tt("Sort by calculated new rating (high to low)"),
    },
    {
      label: "By Previous Rating",
      onClick: () => handleItemClick("Sort:By Previous Rating", () => onSort("rating")),
      dataMenuItem: "By Previous Rating",
      tooltip: tt("Sort by previous rating (high to low)"),
    },
  ];

  // tooltip.md: [Mobile Menu] Operations Menu Items
  const operationsItems: MenuItem[] = [
    {
      label: "Recalculate_Save",
      onClick: () => handleItemClick("Recalculate_Save", onRecalculateRatings),
      dataMenuItem: "Recalculate_Save",
      disabled: !writePermission,
      tooltip: tt("Recalculate all ratings from game results and save"),
    },
    {
      label: "Check Errors",
      onClick: () => handleItemClick("Check Errors", onCheckErrors),
      dataMenuItem: "Check Errors",
      tooltip: tt("Check for data entry errors in game results"),
    },
    {
      label: "Enter Games",
      onClick: () => handleItemClick("Enter Games", onEnterGames || (() => {})),
      dataMenuItem: "Enter Games",
      disabled: !writePermission,
      tooltip: tt("Enter or correct game results"),
    },
    {
      label: "Paste Multiple Results",
      onClick: () => handleItemClick("Paste Multiple Results", onBulkPaste || (() => {})),
      dataMenuItem: "Paste Multiple Results",
      disabled: !writePermission,
      tooltip: tt("Paste multiple game results from clipboard at once"),
    },
    ...(serverUrl && !hasAdminApiKey && !isAdmin
      ? []
      : [{
          label: isAdmin ? "Exit Admin Mode" : "Admin Mode",
          onClick: () => handleItemClick(isAdmin ? "Exit Admin Mode" : "Admin Mode", onToggleAdmin),
          dataMenuItem: isAdmin ? "Exit Admin Mode" : "Admin Mode",
          disabled: !writePermission && !isAdmin,
          tooltip: tt("Toggle admin mode for write access"),
        }]),
    // tooltip.md: [Mobile Menu] Operations Menu Items
    ...(isAdmin && onAddPlayer
       ? [
           {
            label: "Add Player",
            onClick: () => handleItemClick("Add Player", onAddPlayer),
            dataMenuItem: "Add Player",
            disabled: !writePermission,
            tooltip: tt("Add a new player to the ladder"),
           },
         ]
       : []),
      ...(isAdmin && onDeleteHiddenPlayers
       ? [
           {
            label: "Delete Players",
            onClick: () => handleItemClick("Delete Hidden Players", onDeleteHiddenPlayers),
            dataMenuItem: "Delete Hidden Players",
            disabled: !writePermission,
            tooltip: tt("Delete hidden players (group ending in X)"),
           },
         ]
       : []),
      ...(isAdmin && onAutoLetter
       ? [
           {
            label: "Auto-Letter",
            onClick: () => handleItemClick("Auto-Letter", onAutoLetter),
            dataMenuItem: "Auto-Letter",
            disabled: !writePermission,
            tooltip: tt("Auto-generate tournament letters for players"),
           },
         ]
       : []),
    // tooltip.md: [Mobile Menu] Operations Menu Items
    ...(isAdmin && onRestoreBackup
         ? [
             {
              label: "Restore Backup",
              onClick: () => handleItemClick("Restore Backup", onRestoreBackup),
              dataMenuItem: "Restore Backup",
              disabled: !writePermission,
              tooltip: tt("Restore ladder data from a previous backup"),
             },
           ]
         : []),
      ...(isAdmin && onPrintLabels
         ? [
             {
               label: "Print Labels",
               onClick: () => handleItemClick("Print Labels", onPrintLabels),
               dataMenuItem: "Print Labels",
               tooltip: tt("Print player labels for tournaments"),
             },
           ]
         : []),
  ];

  // tooltip.md: [Mobile Menu] View Menu Items
  const viewItems: MenuItem[] = [
    {
      label: "Zoom 50%",
      onClick: () => handleItemClick("Zoom 50%", () => onSetZoom("50%")),
      dataMenuItem: "Zoom 50%",
      tooltip: tt("Set table zoom to 50%"),
    },
    {
      label: "Zoom 70%",
      onClick: () => handleItemClick("Zoom 70%", () => onSetZoom("70%")),
      dataMenuItem: "Zoom 70%",
      tooltip: tt("Set table zoom to 70%"),
    },
    {
      label: "Zoom 100%",
      onClick: () => handleItemClick("Zoom 100%", () => onSetZoom("100%")),
      dataMenuItem: "Zoom 100%",
      tooltip: tt("Set table zoom to 100% (default)"),
    },
    {
      label: "Zoom 140%",
      onClick: () => handleItemClick("Zoom 140%", () => onSetZoom("140%")),
      dataMenuItem: "Zoom 140%",
      tooltip: tt("Set table zoom to 140%"),
    },
    {
      label: "Zoom 200%",
      onClick: () => handleItemClick("Zoom 200%", () => onSetZoom("200%")),
      dataMenuItem: "Zoom 200%",
      tooltip: tt("Set table zoom to 200%"),
    },
  ];

  const renderSection = (
    title: string,
    icon: React.ReactNode,
    items: MenuItem[],
    showCheckmarks?: boolean,
  ) => (
    <div style={{ marginBottom: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.75rem 1rem",
          backgroundColor: "#f1f5f9",
          borderRadius: "0.25rem",
          fontSize: "0.875rem",
          fontWeight: "600",
          color: "#475569",
        }}
      >
        {icon}
        <span>{title}</span>
      </div>
      <div>
        {items.map((item) => (
          <button
            key={item.dataMenuItem}
            data-menu-item={item.dataMenuItem}
            title={item.tooltip}
            onClick={item.onClick}
            disabled={item.disabled}
            style={{
              width: "100%",
              padding: "1rem",
              textAlign: "left",
              backgroundColor: "transparent",
              border: "none",
              fontSize: "1rem",
              color: item.disabled ? "#9ca3af" : (item.color || "#374151"),
              cursor: item.disabled ? "not-allowed" : "pointer",
              borderRadius: "0.25rem",
              marginBottom: "0.25rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              opacity: item.disabled ? 0.5 : 1,
              fontStyle: item.disabled ? "italic" : "normal",
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                e.currentTarget.style.backgroundColor = "#e2e8f0";
              }
            }}
            onMouseLeave={(e) => {
              if (!item.disabled) {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            <span>{item.label}</span>
            {showCheckmarks && item.hasCheckmark && (
              <Check size={18} color="#3b82f6" />
            )}
            {item.disabled && (
              <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                (not available)
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          zIndex: 1000,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "80%",
          maxWidth: "320px",
          backgroundColor: "white",
          zIndex: 1001,
          overflowY: "auto",
          boxShadow: "-4px 0 6px rgba(0, 0, 0, 0.1)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem",
            background: miniGamesHaveResults ? "linear-gradient(135deg, #166534 0%, #22c55e 100%)" : !writePermission ? "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)" : "linear-gradient(135deg, #0f172a 0%, #334155 100%)",
            color: "white",
          }}
        >
          <span style={{ fontSize: "1.125rem", fontWeight: "600" }}>Menu</span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "white",
              cursor: "pointer",
              padding: "0.5rem",
            }}
          >
            <X size={24} />
          </button>
        </div>

        <div style={{ padding: "1rem" }}>
          {renderSection("File", <Folder size={18} />, fileItems)}
          {renderSection("Title", <Type size={18} />, titleItems, true)}
          {renderSection("Sort By", <ListFilter size={18} />, sortItems)}
          {renderSection(
            "Operations",
            <SettingsIcon size={18} />,
            operationsItems,
          )}
          {renderSection("View", <Eye size={18} />, viewItems)}

          <div style={{ marginBottom: "1.5rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1rem",
                backgroundColor: "#f1f5f9",
                borderRadius: "0.25rem",
                fontSize: "0.875rem",
                fontWeight: "600",
                color: "#475569",
              }}
            >
              <SettingsIcon size={18} />
              <span>Configuration</span>
            </div>
            <button
              data-menu="Settings"
              data-menu-item="Open Settings"
              onClick={() => handleItemClick("Settings", onOpenSettings)}
              style={{
                width: "100%",
                padding: "1rem",
                textAlign: "left",
                backgroundColor: "transparent",
                border: "none",
                fontSize: "1rem",
                color: "#374151",
                cursor: "pointer",
                borderRadius: "0.25rem",
                marginTop: "0.25rem",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#e2e8f0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              Open Settings
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
