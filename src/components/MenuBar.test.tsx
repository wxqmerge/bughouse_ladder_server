import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MenuBar from "./MenuBar";
import "@testing-library/jest-dom";

const baseProps = {
  onFileAction: vi.fn(),
  onSort: vi.fn(),
  onRecalculateRatings: vi.fn(),
  onCheckErrors: vi.fn(),
  onToggleAdmin: vi.fn(),
  onSetZoom: vi.fn(),
  onOpenSettings: vi.fn(),
  isAdmin: false,
  isWide: true,
  zoomLevel: "100%",
  projectName: "Bughouse",
  playerCount: 24,
};

describe("MenuBar component", () => {
  describe("non-admin mode (default)", () => {
    it("should render menu bar with File, Operations and View menus (non-admin)", () => {
      render(<MenuBar {...baseProps} isAdmin={false} />);
      
      expect(screen.getByText("File")).toBeInTheDocument();
      expect(screen.getByText("Operations")).toBeInTheDocument();
      expect(screen.getByText("View")).toBeInTheDocument();
      expect(screen.queryByText("Sort")).not.toBeInTheDocument();
    });

    it("should display project name", () => {
      render(<MenuBar {...baseProps} projectName="My Ladder" />);
      expect(screen.getByText(/My Ladder/)).toBeInTheDocument();
    });

    it("should display player count", () => {
      render(<MenuBar {...baseProps} playerCount={42} />);
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("Total Players")).toBeInTheDocument();
    });

    describe("Operations menu items", () => {
      it("should have Recalculate_Save button", () => {
        const { rerender } = render(<MenuBar {...baseProps} />);
        fireEvent.click(screen.getByText("Operations"));
        expect(screen.getByText("Recalculate_Save")).toBeInTheDocument();
      });

      it("should call onRecalculateRatings when Recalculate_Save clicked", () => {
        const props = { ...baseProps, onRecalculateRatings: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Operations"));
        fireEvent.click(screen.getByText("Recalculate_Save"));
        expect(props.onRecalculateRatings).toHaveBeenCalledTimes(1);
      });

      it("should have Check Errors button", () => {
        render(<MenuBar {...baseProps} />);
        fireEvent.click(screen.getByText("Operations"));
        expect(screen.getByText("Check Errors")).toBeInTheDocument();
      });

      it("should call onCheckErrors when Check Errors clicked", () => {
        const props = { ...baseProps, onCheckErrors: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Operations"));
        fireEvent.click(screen.getByText("Check Errors"));
        expect(props.onCheckErrors).toHaveBeenCalledTimes(1);
      });

      it("should have Enter Games button", () => {
        const props = { ...baseProps, onEnterGames: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Operations"));
        expect(screen.getByText("Enter Games")).toBeInTheDocument();
      });

      it("should call onEnterGames when Enter Games clicked", () => {
        const props = { ...baseProps, onEnterGames: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Operations"));
        fireEvent.click(screen.getByText("Enter Games"));
        expect(props.onEnterGames).toHaveBeenCalledTimes(1);
      });

      it("should have Paste Multiple Results button", () => {
        const props = { ...baseProps, onBulkPaste: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Operations"));
        expect(screen.getByText("Paste Multiple Results")).toBeInTheDocument();
      });

      it("should call onBulkPaste when Paste Multiple Results clicked", () => {
        const props = { ...baseProps, onBulkPaste: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Operations"));
        fireEvent.click(screen.getByText("Paste Multiple Results"));
        expect(props.onBulkPaste).toHaveBeenCalledTimes(1);
      });

      it("should have Settings button", () => {
        const props = { ...baseProps, onOpenSettings: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Operations"));
        expect(screen.getByText("Settings")).toBeInTheDocument();
      });

      it("should call onOpenSettings when Settings clicked", () => {
        const props = { ...baseProps, onOpenSettings: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Operations"));
        fireEvent.click(screen.getByText("Settings"));
        expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
      });

      it("should NOT show Admin Mode button when admin mode disabled", () => {
        const props = {
          ...baseProps,
          serverUrl: "http://example.com",
          hasAdminApiKey: false,
        };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Operations"));
        expect(screen.queryByText("Admin Mode")).not.toBeInTheDocument();
        expect(screen.queryByText("Exit Admin Mode")).not.toBeInTheDocument();
      });

      it("should NOT show Add Player button without onAddPlayer callback", () => {
        render(<MenuBar {...baseProps} />);
        fireEvent.click(screen.getByText("Operations"));
        expect(screen.queryByText("Add Player")).not.toBeInTheDocument();
      });
    });

    describe("View menu items", () => {
      it("should have all 5 zoom level buttons", () => {
        render(<MenuBar {...baseProps} />);
        fireEvent.click(screen.getByText("View"));
        
        expect(screen.getByText("Zoom 50%")).toBeInTheDocument();
        expect(screen.getByText("Zoom 70%")).toBeInTheDocument();
        expect(screen.getByText("Zoom 100%")).toBeInTheDocument();
        expect(screen.getByText("Zoom 140%")).toBeInTheDocument();
        expect(screen.getByText("Zoom 200%")).toBeInTheDocument();
      });

      it("should call onSetZoom('50%') when Zoom 50% clicked", () => {
        const props = { ...baseProps, onSetZoom: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("View"));
        fireEvent.click(screen.getByText("Zoom 50%"));
        expect(props.onSetZoom).toHaveBeenCalledWith("50%");
      });

      it("should call onSetZoom('70%') when Zoom 70% clicked", () => {
        const props = { ...baseProps, onSetZoom: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("View"));
        fireEvent.click(screen.getByText("Zoom 70%"));
        expect(props.onSetZoom).toHaveBeenCalledWith("70%");
      });

      it("should call onSetZoom('100%') when Zoom 100% clicked", () => {
        const props = { ...baseProps, onSetZoom: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("View"));
        fireEvent.click(screen.getByText("Zoom 100%"));
        expect(props.onSetZoom).toHaveBeenCalledWith("100%");
      });

      it("should call onSetZoom('140%') when Zoom 140% clicked", () => {
        const props = { ...baseProps, onSetZoom: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("View"));
        fireEvent.click(screen.getByText("Zoom 140%"));
        expect(props.onSetZoom).toHaveBeenCalledWith("140%");
      });

      it("should call onSetZoom('200%') when Zoom 200% clicked", () => {
        const props = { ...baseProps, onSetZoom: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("View"));
        fireEvent.click(screen.getByText("Zoom 200%"));
        expect(props.onSetZoom).toHaveBeenCalledWith("200%");
      });
    });

    describe("Menu open/close behavior", () => {
      it("should close menu after clicking an item", () => {
        render(<MenuBar {...baseProps} />);
        fireEvent.click(screen.getByText("View"));
        expect(screen.getByText("Zoom 100%")).toBeInTheDocument();
        
        fireEvent.click(screen.getByText("Zoom 100%"));
        // Menu should close - clicking View again should reopen it (not auto-open)
        expect(screen.queryByText("Zoom 50%")).not.toBeInTheDocument();
      });

      it("should close Operations menu after clicking an item", () => {
        render(<MenuBar {...baseProps} />);
        fireEvent.click(screen.getByText("Operations"));
        expect(screen.getByText("Settings")).toBeInTheDocument();
        
        fireEvent.click(screen.getByText("Settings"));
        expect(screen.queryByText("Recalculate_Save")).not.toBeInTheDocument();
      });
    });
  });

  describe("admin mode", () => {
    const adminProps = {
      ...baseProps,
      isAdmin: true,
    };

    it("should render File and Sort menus in admin mode", () => {
      render(<MenuBar {...adminProps} />);
      
      expect(screen.getByText("File")).toBeInTheDocument();
      expect(screen.getByText("Sort")).toBeInTheDocument();
      expect(screen.getByText("Operations")).toBeInTheDocument();
      expect(screen.getByText("View")).toBeInTheDocument();
    });

    describe("File menu items", () => {
      it("should have Load button", () => {
        const props = { ...adminProps, onFileAction: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("File"));
        expect(screen.getByText("Load")).toBeInTheDocument();
      });

      it("should call onFileAction('load') when Load clicked", () => {
        const props = { ...adminProps, onFileAction: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("File"));
        fireEvent.click(screen.getByText("Load"));
        expect(props.onFileAction).toHaveBeenCalledWith("load");
      });

      it("should have Export button", () => {
        const props = { ...adminProps, onFileAction: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("File"));
        expect(screen.getByText("Export")).toBeInTheDocument();
      });

      it("should call onFileAction('export') when Export clicked", () => {
        const props = { ...adminProps, onFileAction: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("File"));
        fireEvent.click(screen.getByText("Export"));
        expect(props.onFileAction).toHaveBeenCalledWith("export");
      });

      it("should show Title menu items after File items", () => {
        render(<MenuBar {...adminProps} />);
        fireEvent.click(screen.getByText("File"));
        
        // Title options should be visible
        expect(screen.getByText("Ladder")).toBeInTheDocument();
        expect(screen.getByText("Bughouse")).toBeInTheDocument();
        expect(screen.getByText("BG_Game")).toBeInTheDocument();
        expect(screen.getByText("Bishop_Game")).toBeInTheDocument();
        expect(screen.getByText("Pillar_Game")).toBeInTheDocument();
        expect(screen.getByText("Kings_Cross")).toBeInTheDocument();
        expect(screen.getByText("Pawn_Game")).toBeInTheDocument();
        expect(screen.getByText("Queen_Game")).toBeInTheDocument();
      });

      it("should call onSetTitle with each title option", () => {
        const props = { ...adminProps, onSetTitle: vi.fn() };
        render(<MenuBar {...props} />);
        
        fireEvent.click(screen.getByText("File"));
        fireEvent.click(screen.getByText("Ladder"));
        expect(props.onSetTitle).toHaveBeenCalledWith("Ladder");
        
        fireEvent.click(screen.getByText("File"));
        fireEvent.click(screen.getByText("BG_Game"));
        expect(props.onSetTitle).toHaveBeenCalledWith("BG_Game");
        
        fireEvent.click(screen.getByText("File"));
        fireEvent.click(screen.getByText("Queen_Game"));
        expect(props.onSetTitle).toHaveBeenCalledWith("Queen_Game");
      });

      it("should show checkmark for current title", () => {
        render(<MenuBar {...adminProps} projectName="BG_Game" />);
        fireEvent.click(screen.getByText("File"));
        
        // The checkmark icon should be present next to BG_Game
        const bgGameItem = screen.getByText("BG_Game").closest('[role="menuitem"]');
        expect(bgGameItem?.querySelector('svg')).toBeInTheDocument();
      });
    });

    describe("Sort menu items", () => {
      it("should have all 5 sort options", () => {
        render(<MenuBar {...adminProps} />);
        fireEvent.click(screen.getByText("Sort"));
        
        expect(screen.getByText("By Rank")).toBeInTheDocument();
        expect(screen.getByText("By Last Name")).toBeInTheDocument();
        expect(screen.getByText("By First Name")).toBeInTheDocument();
        expect(screen.getByText("By New Rating")).toBeInTheDocument();
        expect(screen.getByText("By Previous Rating")).toBeInTheDocument();
      });

      it("should call onSort('rank') when By Rank clicked", () => {
        const props = { ...adminProps, onSort: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Sort"));
        fireEvent.click(screen.getByText("By Rank"));
        expect(props.onSort).toHaveBeenCalledWith("rank");
      });

      it("should call onSort('byLastName') when By Last Name clicked", () => {
        const props = { ...adminProps, onSort: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Sort"));
        fireEvent.click(screen.getByText("By Last Name"));
        expect(props.onSort).toHaveBeenCalledWith("byLastName");
      });

      it("should call onSort('byFirstName') when By First Name clicked", () => {
        const props = { ...adminProps, onSort: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Sort"));
        fireEvent.click(screen.getByText("By First Name"));
        expect(props.onSort).toHaveBeenCalledWith("byFirstName");
      });

      it("should call onSort('nRating') when By New Rating clicked", () => {
        const props = { ...adminProps, onSort: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Sort"));
        fireEvent.click(screen.getByText("By New Rating"));
        expect(props.onSort).toHaveBeenCalledWith("nRating");
      });

      it("should call onSort('rating') when By Previous Rating clicked", () => {
        const props = { ...adminProps, onSort: vi.fn() };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Sort"));
        fireEvent.click(screen.getByText("By Previous Rating"));
        expect(props.onSort).toHaveBeenCalledWith("rating");
      });
    });

    describe("Admin Mode toggle", () => {
      it("should show Admin Mode button when in admin mode with API key", () => {
        const props = {
          ...adminProps,
          serverUrl: "http://example.com",
          hasAdminApiKey: true,
        };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Operations"));
        expect(screen.getByText("Exit Admin Mode")).toBeInTheDocument();
      });

      it("should call onToggleAdmin when Exit Admin Mode clicked", () => {
        const props = {
          ...adminProps,
          serverUrl: "http://example.com",
          hasAdminApiKey: true,
          onToggleAdmin: vi.fn(),
        };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Operations"));
        fireEvent.click(screen.getByText("Exit Admin Mode"));
        expect(props.onToggleAdmin).toHaveBeenCalledTimes(1);
      });

      it("should show Admin Mode button when not admin but has API key", () => {
        const props = {
          ...baseProps,
          isAdmin: false,
          serverUrl: "http://example.com",
          hasAdminApiKey: true,
        };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Operations"));
        expect(screen.getByText("Admin Mode")).toBeInTheDocument();
      });

      it("should show Admin Mode button in local mode (no server)", () => {
        const props = { ...adminProps, serverUrl: null as any };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Operations"));
        expect(screen.getByText("Exit Admin Mode")).toBeInTheDocument();
      });

      it("should NOT show Admin Mode when admin disabled", () => {
        const props = {
          ...baseProps,
          serverUrl: "http://example.com",
          hasAdminApiKey: false,
        };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Operations"));
        expect(screen.queryByText("Admin Mode")).not.toBeInTheDocument();
        expect(screen.queryByText("Exit Admin Mode")).not.toBeInTheDocument();
      });
    });

    describe("Add Player in admin mode", () => {
      it("should show Add Player button when admin and onAddPlayer provided", () => {
        const props = {
          ...adminProps,
          onAddPlayer: vi.fn(),
        };
        render(<MenuBar {...props} />);
        fireEvent.click(screen.getByText("Operations"));
        expect(screen.getByText("Add Player")).toBeInTheDocument();
      });
    });

    describe("server mode with admin disabled", () => {




    it("should show File menu but hide Sort when server configured without API key", () => {
      render(<MenuBar {...baseProps} serverUrl="http://example.com" hasAdminApiKey={false} />);
      expect(screen.getByText("File")).toBeInTheDocument();
      expect(screen.queryByText("Sort")).not.toBeInTheDocument();
    });

    it("should hide Sort menu when server configured without API key", () => {
      render(<MenuBar {...baseProps} serverUrl="http://example.com" hasAdminApiKey={false} />);
      expect(screen.queryByText("Sort")).not.toBeInTheDocument();
    });

    it("should show File and Sort menus in local mode (no server)", () => {
      render(<MenuBar {...baseProps} isAdmin={true} />);
      expect(screen.getByText("File")).toBeInTheDocument();
      expect(screen.getByText("Sort")).toBeInTheDocument();
    });

    it("should show File and Sort menus when server reachable with API key", () => {
      render(<MenuBar {...baseProps} isAdmin={true} serverUrl="http://example.com" hasAdminApiKey={true} />);
      expect(screen.getByText("File")).toBeInTheDocument();
      expect(screen.getByText("Sort")).toBeInTheDocument();
    });
    });
  });

  describe("keyboard navigation", () => {
    it("should trigger menu item on Enter key", () => {
      const props = { ...baseProps, onSetZoom: vi.fn() };
      render(<MenuBar {...props} />);
      
      fireEvent.click(screen.getByText("View"));
      const zoomItem = screen.getByText("Zoom 100%");
      fireEvent.keyDown(zoomItem, { key: "Enter" });
      expect(props.onSetZoom).toHaveBeenCalledWith("100%");
    });

    it("should trigger menu item on Space key", () => {
      const props = { ...baseProps, onSetZoom: vi.fn() };
      render(<MenuBar {...props} />);
      
      fireEvent.click(screen.getByText("View"));
      const zoomItem = screen.getByText("Zoom 100%");
      fireEvent.keyDown(zoomItem, { key: " " });
      expect(props.onSetZoom).toHaveBeenCalledWith("100%");
    });
  });

  describe("aria attributes", () => {
    it("should have role='menu' on menu item containers", () => {
      render(<MenuBar {...baseProps} />);
      fireEvent.click(screen.getByText("View"));
      
      const menuContainers = document.querySelectorAll('[role="menu"]');
      expect(menuContainers.length).toBeGreaterThan(0);
    });

    it("should have role='menuitem' on individual items", () => {
      render(<MenuBar {...baseProps} />);
      fireEvent.click(screen.getByText("View"));
      
      const menuItems = document.querySelectorAll('[role="menuitem"]');
      expect(menuItems.length).toBeGreaterThan(0);
    });

    it("should have data-menu-item attributes on all items", () => {
      render(<MenuBar {...baseProps} />);
      fireEvent.click(screen.getByText("View"));
      
      const menuItems = document.querySelectorAll('[data-menu-item]');
      expect(menuItems.length).toBe(5); // 5 zoom options
    });

    it("should have data-menu attributes on menu triggers", () => {
      render(<MenuBar {...baseProps} />);
      
      const menuTriggers = document.querySelectorAll('[data-menu]');
      expect(menuTriggers.length).toBeGreaterThan(0);
    });
  });

  describe("multiple menu items call their callbacks", () => {
    it("should allow switching between menus", () => {
      render(<MenuBar {...baseProps} />);
      
      fireEvent.click(screen.getByText("View"));
      expect(screen.getByText("Zoom 100%")).toBeInTheDocument();
      
      fireEvent.click(screen.getByText("Operations"));
      expect(screen.getByText("Settings")).toBeInTheDocument();
      expect(screen.queryByText("Zoom 100%")).not.toBeInTheDocument();
    });

    it("should handle rapid menu toggling", () => {
      render(<MenuBar {...baseProps} />);
      
      // Click View, then Operations, then View again
      fireEvent.click(screen.getByText("View"));
      expect(screen.getByText("Zoom 100%")).toBeInTheDocument();
      
      fireEvent.click(screen.getByText("Operations"));
      expect(screen.getByText("Settings")).toBeInTheDocument();
      
      fireEvent.click(screen.getByText("View"));
      expect(screen.getByText("Zoom 50%")).toBeInTheDocument();
    });
  });
});
