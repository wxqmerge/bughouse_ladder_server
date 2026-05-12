import {
  X,
  Folder,
  ListFilter,
  Settings as SettingsIcon,
  Eye,
  Type,
  Check,
} from "lucide-react";
import { getVisibleTitles } from "../utils/titleMenu";
import { titleToFileName } from "../utils/constants";

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
  onEnterGames?: () => void;
  onRestoreBackup?: () => void;
  onDeleteHiddenPlayers?: () => void;
  onAutoLetter?: () => void;
  isAdmin: boolean;
  tournamentMode?: boolean;
  projectName?: string;
  onSetTitle?: (title: string) => void;
  availableMiniGames?: string[];
  writePermission?: boolean;
}

interface MenuItem {
  label: string;
  onClick: () => void;
  dataMenuItem: string;
  hasCheckmark?: boolean;
  disabled?: boolean;
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
  onEnterGames,
  onRestoreBackup,
  onDeleteHiddenPlayers,
  onAutoLetter,
  isAdmin,
  tournamentMode = false,
  projectName,
  onSetTitle,
  availableMiniGames = [],
  writePermission = true,
}: MobileMenuProps) {
  if (!isOpen) return null;

  const handleItemClick = (onClick: () => void) => {
    onClick();
    onClose();
  };

  const fileItems: MenuItem[] = [
    {
      label: "Load",
      onClick: () => handleItemClick(() => onFileAction("load")),
      dataMenuItem: "Load",
      disabled: !isAdmin || tournamentMode,
    },
    {
      label: "Export",
      onClick: () => handleItemClick(() => onFileAction("export")),
      dataMenuItem: "Export",
    },
  ];

  const visibleTitles = getVisibleTitles(isAdmin, availableMiniGames);

  const titleItems: MenuItem[] = visibleTitles.map((title) => {
    const isMiniGame = title !== "Ladder";
    const fileName = isMiniGame ? titleToFileName(title) : null;
    const isAvailable = fileName ? availableMiniGames.includes(fileName) : true;
    const isDisabled = !isAdmin && isMiniGame && !isAvailable;
    
    return {
      label: title,
      onClick: () => {
        if (isDisabled) {
          alert(`"${title}" is not available yet. Only admin can create mini-games.`);
          return;
        }
        handleItemClick(() => onSetTitle?.(title));
      },
      dataMenuItem: `Title-${title}`,
      hasCheckmark: projectName?.toLowerCase() === title.toLowerCase(),
      disabled: isDisabled,
    };
  });

  const sortItems: MenuItem[] = [
    {
      label: "By Rank",
      onClick: () => handleItemClick(() => onSort("rank")),
      dataMenuItem: "By Rank",
    },
    {
      label: "By Last Name",
      onClick: () => handleItemClick(() => onSort("byLastName")),
      dataMenuItem: "By Last Name",
    },
    {
      label: "By First Name",
      onClick: () => handleItemClick(() => onSort("byFirstName")),
      dataMenuItem: "By First Name",
    },
    {
      label: "By New Rating",
      onClick: () => handleItemClick(() => onSort("nRating")),
      dataMenuItem: "By New Rating",
    },
    {
      label: "By Previous Rating",
      onClick: () => handleItemClick(() => onSort("rating")),
      dataMenuItem: "By Previous Rating",
    },
  ];

 const operationsItems: MenuItem[] = [
    {
      label: "Recalculate_Save",
      onClick: () => handleItemClick(onRecalculateRatings),
      dataMenuItem: "Recalculate_Save",
      disabled: !writePermission,
    },
    {
      label: "Check Errors",
      onClick: () => handleItemClick(onCheckErrors),
      dataMenuItem: "Check Errors",
    },
    {
      label: "Enter Games",
      onClick: () => handleItemClick(onEnterGames || (() => {})),
      dataMenuItem: "Enter Games",
      disabled: !writePermission,
    },
    {
      label: isAdmin ? "Exit Admin Mode" : "Admin Mode",
      onClick: () => handleItemClick(onToggleAdmin),
      dataMenuItem: isAdmin ? "Exit Admin Mode" : "Admin Mode",
      disabled: !writePermission,
    },
...(isAdmin && onAddPlayer
       ? [
           {
             label: "Add Player",
             onClick: () => handleItemClick(onAddPlayer),
             dataMenuItem: "Add Player",
             disabled: !writePermission,
           },
         ]
       : []),
      ...(isAdmin && onDeleteHiddenPlayers
       ? [
           {
             label: "Delete Hidden Players",
             onClick: () => handleItemClick(onDeleteHiddenPlayers),
             dataMenuItem: "Delete Hidden Players",
             disabled: !writePermission,
           },
         ]
       : []),
      ...(isAdmin && onAutoLetter
       ? [
           {
             label: "Auto-Letter",
             onClick: () => handleItemClick(onAutoLetter),
             dataMenuItem: "Auto-Letter",
             disabled: !writePermission,
           },
         ]
       : []),
      ...(isAdmin && onRestoreBackup
       ? [
           {
             label: "Restore Backup",
             onClick: () => handleItemClick(onRestoreBackup),
             dataMenuItem: "Restore Backup",
             disabled: !writePermission,
           },
         ]
       : []),
  ];

  const viewItems: MenuItem[] = [
    {
      label: "Zoom 50%",
      onClick: () => handleItemClick(() => onSetZoom("50%")),
      dataMenuItem: "Zoom 50%",
    },
    {
      label: "Zoom 70%",
      onClick: () => handleItemClick(() => onSetZoom("70%")),
      dataMenuItem: "Zoom 70%",
    },
    {
      label: "Zoom 100%",
      onClick: () => handleItemClick(() => onSetZoom("100%")),
      dataMenuItem: "Zoom 100%",
    },
    {
      label: "Zoom 140%",
      onClick: () => handleItemClick(() => onSetZoom("140%")),
      dataMenuItem: "Zoom 140%",
    },
    {
      label: "Zoom 200%",
      onClick: () => handleItemClick(() => onSetZoom("200%")),
      dataMenuItem: "Zoom 200%",
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
            onClick={item.onClick}
            disabled={item.disabled}
            style={{
              width: "100%",
              padding: "1rem",
              textAlign: "left",
              backgroundColor: "transparent",
              border: "none",
              fontSize: "1rem",
              color: item.disabled ? "#9ca3af" : "#374151",
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
            backgroundColor: tournamentMode ? "#166534" : !writePermission ? "#1e40af" : "#1e293b",
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
              onClick={() => handleItemClick(onOpenSettings)}
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
