/**
 * Tests for smart Add Player feature
 * Covers error 11 validation, suggestedRank flow, and inline add buttons
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { processGameResults } from '../../../shared/utils/hashUtils';
import type { PlayerData, ValidationResult } from '../../../shared/types';
import AddPlayerDialog from '../../components/AddPlayerDialog';
import ErrorDialog from '../../components/ErrorDialog';
import '@testing-library/jest-dom';

function makePlayer(rank: number, gameResults?: (string | null)[]): PlayerData {
  return {
    rank,
    group: 'A',
    lastName: `P${rank}`,
    firstName: `F${rank}`,
    rating: 1200 + rank * 100,
    nRating: 1200 + rank * 100,
    trophyEligible: true,
    grade: '5',
    num_games: 5,
    attendance: 0,
    info: '',
    phone: '',
    school: '',
    room: '',
    gameResults: gameResults || Array(31).fill(null),
  };
}

describe('processGameResults - invalid player refs (error 11)', () => {
  it('should push error 11 for missing player in 2-player game', () => {
    const players = [
      makePlayer(5, ['5W16', null, ...Array(29).fill(null)]),
    ];

    const result = processGameResults(players, 31);

    expect(result.hasErrors).toBe(true);
    expect(result.errorCount).toBeGreaterThan(0);
    const error11 = result.errors.find(e => e.error === 11);
    expect(error11).toBeDefined();
    expect(error11!.player1).toBe(5);
    expect(error11!.player2).toBe(16);
  });

  it('should push error 11 for missing opposing player', () => {
    const players = [
      makePlayer(1, ['1W99', null, ...Array(29).fill(null)]),
      makePlayer(2, ['2L3', null, ...Array(29).fill(null)]),
      makePlayer(3, ['3W2', null, ...Array(29).fill(null)]),
    ];

    const result = processGameResults(players, 31);

    const error11 = result.errors.find(e => e.error === 11);
    expect(error11).toBeDefined();
    expect(error11!.player2).toBe(99);
  });

  it('should push error 11 for both missing players', () => {
    const players = [
      makePlayer(1, ['1W2', null, ...Array(29).fill(null)]),
    ];

    const result = processGameResults(players, 31);

    const error11 = result.errors.find(e => e.error === 11);
    expect(error11).toBeDefined();
  });

  it('should push error 11 for missing player in 4-player game', () => {
    const players = [
      makePlayer(1, ['1:2W3:99', null, ...Array(29).fill(null)]),
      makePlayer(2, ['1:2W3:99', null, ...Array(29).fill(null)]),
      makePlayer(3, ['1:2L3:99', null, ...Array(29).fill(null)]),
    ];

    const result = processGameResults(players, 31);

    const error11 = result.errors.find(e => e.error === 11);
    expect(error11).toBeDefined();
    expect(error11!.player4).toBe(99);
  });

  it('should push error 11 for missing player 3 in 4-player game', () => {
    const players = [
      makePlayer(1, ['1:2W99:4', null, ...Array(29).fill(null)]),
      makePlayer(2, ['1:2W99:4', null, ...Array(29).fill(null)]),
      makePlayer(4, ['1:2L99:4', null, ...Array(29).fill(null)]),
    ];

    const result = processGameResults(players, 31);

    const error11 = result.errors.find(e => e.error === 11);
    expect(error11).toBeDefined();
    // Hash parser sorts team members, so 99:4 → player3=4, player4=99
    expect(error11!.player4).toBe(99);
  });

  it('should push error 11 for both missing players in 4-player game', () => {
    const players = [
      makePlayer(1, ['1:2W98:99', null, ...Array(29).fill(null)]),
      makePlayer(2, ['1:2W98:99', null, ...Array(29).fill(null)]),
    ];

    const result = processGameResults(players, 31);

    const error11 = result.errors.find(e => e.error === 11);
    expect(error11).toBeDefined();
    expect(error11!.player3).toBe(98);
    expect(error11!.player4).toBe(99);
  });

  it('should NOT push error 11 when all players exist', () => {
    const players = [
      makePlayer(5, ['5W6', null, ...Array(29).fill(null)]),
      makePlayer(6, ['6L5', null, ...Array(29).fill(null)]),
    ];

    const result = processGameResults(players, 31);

    const error11 = result.errors.find(e => e.error === 11);
    expect(error11).toBeUndefined();
  });

  it('should include originalString in error 11', () => {
    const players = [
      makePlayer(5, ['5W16', null, ...Array(29).fill(null)]),
    ];

    const result = processGameResults(players, 31);

    const error11 = result.errors.find(e => e.error === 11);
    expect(error11!.originalString).toBe('5W16');
  });

  it('should include playerRank in error 11', () => {
    const players = [
      makePlayer(5, ['5W16', null, ...Array(29).fill(null)]),
    ];

    const result = processGameResults(players, 31);

    const error11 = result.errors.find(e => e.error === 11);
    expect(error11!.playerRank).toBe(5);
  });

  it('should include resultIndex in error 11', () => {
    const players = [
      makePlayer(5, ['5W16', '5W7', null, ...Array(28).fill(null)]),
      makePlayer(7, ['7L5', null, ...Array(29).fill(null)]),
    ];

    const result = processGameResults(players, 31);

    const error11 = result.errors.find(e => e.error === 11);
    expect(error11!.resultIndex).toBe(0);
  });
});

describe('AddPlayerDialog - suggestedRank', () => {
  const mockOnAdd = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show default rank when no suggestedRank', () => {
    render(
      <AddPlayerDialog
        isOpen={true}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        currentPlayerCount={10}
      />
    );

    expect(screen.getByText('Add New Player')).toBeInTheDocument();
    const rankInput = screen.getByLabelText('Rank (Auto-assigned)');
    expect(rankInput).toHaveValue(11);
  });

  it('should show suggested rank in title', () => {
    render(
      <AddPlayerDialog
        isOpen={true}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        currentPlayerCount={10}
        suggestedRank={16}
      />
    );

    expect(screen.getByText('Add Player (Rank 16)')).toBeInTheDocument();
  });

  it('should show editable rank input when suggestedRank is set', () => {
    render(
      <AddPlayerDialog
        isOpen={true}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        currentPlayerCount={10}
        suggestedRank={16}
      />
    );

    const rankInput = screen.getByLabelText('Rank');
    expect(rankInput).toHaveValue(16);
    expect(rankInput).not.toBeDisabled();
  });

  it('should show read-only rank input when no suggestedRank', () => {
    render(
      <AddPlayerDialog
        isOpen={true}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        currentPlayerCount={10}
      />
    );

    const rankInput = screen.getByLabelText('Rank (Auto-assigned)');
    expect(rankInput.getAttribute('readonly')).not.toBeNull();
  });

  it('should pass suggestedRank to onAdd callback', () => {
    render(
      <AddPlayerDialog
        isOpen={true}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        currentPlayerCount={10}
        suggestedRank={16}
      />
    );

    fireEvent.change(screen.getByLabelText('Last Name *'), {
      target: { value: 'Smith' },
    });
    fireEvent.change(screen.getByLabelText('First Name *'), {
      target: { value: 'John' },
    });

    fireEvent.click(screen.getByText('Add Player'));

    expect(mockOnAdd).toHaveBeenCalledWith(
      expect.objectContaining({ lastName: 'Smith', firstName: 'John' }),
      16
    );
  });

  it('should allow editing suggested rank', () => {
    render(
      <AddPlayerDialog
        isOpen={true}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        currentPlayerCount={10}
        suggestedRank={16}
      />
    );

    const rankInput = screen.getByLabelText('Rank');
    fireEvent.change(rankInput, { target: { value: '20' } });

    fireEvent.change(screen.getByLabelText('Last Name *'), {
      target: { value: 'Smith' },
    });
    fireEvent.change(screen.getByLabelText('First Name *'), {
      target: { value: 'John' },
    });

    fireEvent.click(screen.getByText('Add Player'));

    expect(mockOnAdd).toHaveBeenCalledWith(
      expect.objectContaining({ lastName: 'Smith', firstName: 'John' }),
      20
    );
  });

  it('should reset custom rank on close and reopen', () => {
    const { rerender } = render(
      <AddPlayerDialog
        isOpen={true}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        currentPlayerCount={10}
        suggestedRank={16}
      />
    );

    const rankInput = screen.getByLabelText('Rank');
    fireEvent.change(rankInput, { target: { value: '25' } });

    rerender(
      <AddPlayerDialog
        isOpen={false}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        currentPlayerCount={10}
        suggestedRank={16}
      />
    );

    rerender(
      <AddPlayerDialog
        isOpen={true}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        currentPlayerCount={10}
        suggestedRank={16}
      />
    );

    expect(screen.getByLabelText('Rank')).toHaveValue(16);
  });
});

describe('ErrorDialog - inline Add Player buttons', () => {
  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();
  const mockOnAddPlayer = vi.fn();

  const players: PlayerData[] = [
    makePlayer(1),
    makePlayer(2),
    makePlayer(5),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show Add Player button for missing player in enter-games mode', () => {
    const error: ValidationResult = {
      hashValue: 0,
      player1: 5,
      player2: 16,
      player3: 0,
      player4: 0,
      score1: 3,
      score2: 0,
      resultIndex: 0,
      isValid: false,
      error: 11,
      originalString: '5W16',
      playerRank: 5,
    };

    render(
      <ErrorDialog
        error={error}
        players={players}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        mode="enter-games"
        hasAdminKey={true}
        onAddPlayer={mockOnAddPlayer}
        entryCell={{ playerRank: 5, round: 0 }}
        existingValue="5W16"
      />
    );

    expect(screen.getByText(/Invalid player \(16\)/)).toBeInTheDocument();
    const addButton = screen.getByRole('button', { name: '+ Add' });
    expect(addButton).toBeInTheDocument();
  });

  it('should call onAddPlayer with correct rank when button clicked', () => {
    const error: ValidationResult = {
      hashValue: 0,
      player1: 5,
      player2: 16,
      player3: 0,
      player4: 0,
      score1: 3,
      score2: 0,
      resultIndex: 0,
      isValid: false,
      error: 11,
      originalString: '5W16',
      playerRank: 5,
    };

    render(
      <ErrorDialog
        error={error}
        players={players}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        mode="enter-games"
        hasAdminKey={true}
        onAddPlayer={mockOnAddPlayer}
        entryCell={{ playerRank: 5, round: 0 }}
        existingValue="5W16"
      />
    );

    const addButton = screen.getByRole('button', { name: '+ Add' });
    fireEvent.click(addButton);

    expect(mockOnAddPlayer).toHaveBeenCalledWith(16);
  });

  it('should NOT show Add Player button without admin key', () => {
    const error: ValidationResult = {
      hashValue: 0,
      player1: 5,
      player2: 16,
      player3: 0,
      player4: 0,
      score1: 3,
      score2: 0,
      resultIndex: 0,
      isValid: false,
      error: 11,
      originalString: '5W16',
      playerRank: 5,
    };

    render(
      <ErrorDialog
        error={error}
        players={players}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        mode="enter-games"
        hasAdminKey={false}
        onAddPlayer={mockOnAddPlayer}
        entryCell={{ playerRank: 5, round: 0 }}
        existingValue="5W16"
      />
    );

    expect(screen.getByText(/Invalid player \(16\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add' })).not.toBeInTheDocument();
  });

  it('should show Add Player buttons for all missing players in 4-player game', () => {
    const error: ValidationResult = {
      hashValue: 0,
      player1: 5,
      player2: 6,
      player3: 98,
      player4: 99,
      score1: 3,
      score2: 0,
      resultIndex: 0,
      isValid: false,
      error: 11,
      originalString: '5:6W98:99',
      playerRank: 5,
    };

    const players4p: PlayerData[] = [
      makePlayer(5),
      makePlayer(6),
    ];

    render(
      <ErrorDialog
        error={error}
        players={players4p}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        mode="enter-games"
        hasAdminKey={true}
        onAddPlayer={mockOnAddPlayer}
        entryCell={{ playerRank: 5, round: 0 }}
        existingValue="5:6W98:99"
      />
    );

    const addButtons = screen.getAllByRole('button', { name: '+ Add' });
    expect(addButtons.length).toBeGreaterThanOrEqual(2);
  });

  it('should show Add Player buttons in recalculate mode for error 11', () => {
    const error: ValidationResult = {
      hashValue: 0,
      player1: 5,
      player2: 16,
      player3: 0,
      player4: 0,
      score1: 3,
      score2: 0,
      resultIndex: 0,
      isValid: false,
      error: 11,
      originalString: '5W16',
      playerRank: 5,
    };

    render(
      <ErrorDialog
        error={error}
        players={players}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        mode="recalculate"
        hasAdminKey={true}
        onAddPlayer={mockOnAddPlayer}
        walkthroughErrors={[error]}
        walkthroughIndex={0}
        onWalkthroughNext={vi.fn()}
        onWalkthroughPrev={vi.fn()}
      />
    );

    const addButtons = screen.getAllByRole('button', { name: /Add Player/ });
    expect(addButtons.length).toBeGreaterThanOrEqual(1);
  });
});
