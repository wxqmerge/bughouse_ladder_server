/**
 * Tests for smart Add Player feature
 * Covers error 11 validation, suggestedRank flow, and inline add buttons
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { processGameResults, repopulateGameResults } from '../../../shared/utils/hashUtils';
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

describe('Enter-games flow: validate before fillCell', () => {
  it('should detect error 11 when game result references missing player', () => {
    const players: PlayerData[] = [
      makePlayer(5, ['5W16_', null, ...Array(29).fill(null)]),
      makePlayer(6, Array(31).fill(null)),
    ];

    const result = processGameResults(players, 31);
    expect(result.hasErrors).toBe(true);
    expect(result.errors.find(e => e.error === 11)).toBeDefined();

    // No match extracted since player 16 doesn't exist
    expect(result.matches.length).toBe(0);
  });

  it('should fill cell only when all player references are valid', () => {
    const players: PlayerData[] = [
      makePlayer(5, Array(31).fill(null)),
      makePlayer(6, Array(31).fill(null)),
    ];

    players[0].gameResults[0] = '5W6_';
    players[1].gameResults[0] = '5W6_';

    const result = processGameResults(players, 31);
    expect(result.hasErrors).toBe(false);
    expect(result.matches.length).toBe(1);
  });
});

describe('Enter-games flow: pendingPlayers sync on add', () => {
  it('should include new player in pendingPlayers after add', () => {
    const pendingPlayers: PlayerData[] = [
      makePlayer(5),
      makePlayer(6),
    ];

    const newPlayer: PlayerData = makePlayer(16);
    const updatedPending = [...pendingPlayers, newPlayer].sort((a, b) => a.rank - b.rank);

    expect(updatedPending.length).toBe(3);
    expect(updatedPending.some(p => p.rank === 16)).toBe(true);
  });

  it('should preserve existing players when syncing pendingPlayers', () => {
    const pendingPlayers: PlayerData[] = [
      makePlayer(5, ['5W6_', null, ...Array(29).fill(null)]),
      makePlayer(6, ['6L5_', null, ...Array(29).fill(null)]),
    ];

    const newPlayer: PlayerData = makePlayer(16);
    const updatedPending = [...pendingPlayers, newPlayer].sort((a, b) => a.rank - b.rank);

    const p5 = updatedPending.find(p => p.rank === 5);
    expect(p5?.gameResults[0]).toBe('5W6_');
    const p6 = updatedPending.find(p => p.rank === 6);
    expect(p6?.gameResults[0]).toBe('6L5_');
  });
});

describe('Enter-games flow: fresh matches extraction on correction', () => {
  it('should extract new match after adding missing player', () => {
    const beforePlayers: PlayerData[] = [
      makePlayer(5, ['5W16_', null, ...Array(29).fill(null)]),
    ];
    const before = processGameResults(beforePlayers, 31);
    expect(before.matches.length).toBe(0);
    expect(before.hasErrors).toBe(true);

    const afterPlayers: PlayerData[] = [
      makePlayer(5, ['5W16_', null, ...Array(29).fill(null)]),
      makePlayer(16, ['5W16_', null, ...Array(29).fill(null)]),
    ];
    const after = processGameResults(afterPlayers, 31);
    expect(after.matches.length).toBe(1);
    expect(after.hasErrors).toBe(false);
    expect(after.matches[0].player1).toBe(5);
    expect(after.matches[0].player2).toBe(16);
  });

  it('should preserve existing matches when extracting fresh matches', () => {
    const players: PlayerData[] = [
      makePlayer(5, ['5W16_', '5W6_', null, ...Array(28).fill(null)]),
      makePlayer(6, [null, '6L5_', null, ...Array(29).fill(null)]),
      makePlayer(16, ['5W16_', null, ...Array(29).fill(null)]),
    ];

    const result = processGameResults(players, 31);

    expect(result.matches.length).toBe(2);
    expect(result.matches.some(m => m.player1 === 5 && m.player2 === 16)).toBe(true);
    expect(result.matches.some(m => m.player1 === 5 && m.player2 === 6)).toBe(true);
  });

  it('should repopulate game results from fresh matches without data loss', () => {
    const players: PlayerData[] = [
      makePlayer(5, ['5W16_', '5W6_', null, ...Array(28).fill(null)]),
      makePlayer(6, [null, '6L5_', null, ...Array(29).fill(null)]),
      makePlayer(16, ['5W16_', null, ...Array(29).fill(null)]),
    ];

    const { matches, playerResultsByMatch } = processGameResults(players, 31);
    const repopulated = repopulateGameResults(players, matches, 31, playerResultsByMatch);

    const p5 = repopulated.find(p => p.rank === 5);
    expect(p5?.gameResults.filter(r => r !== null).length).toBe(2);

    const p6 = repopulated.find(p => p.rank === 6);
    expect(p6?.gameResults.filter(r => r !== null).length).toBe(1);

    const p16 = repopulated.find(p => p.rank === 16);
    expect(p16?.gameResults.filter(r => r !== null).length).toBe(1);
  });
});

describe('Enter-games flow: full correction flow', () => {
  it('should preserve all results through full correction cycle', () => {
    const step1Players: PlayerData[] = [
      makePlayer(5, ['5W6_', null, ...Array(29).fill(null)]),
      makePlayer(6, ['6L5_', null, ...Array(29).fill(null)]),
    ];
    const step1 = processGameResults(step1Players, 31);
    expect(step1.matches.length).toBe(1);

    const step2Players: PlayerData[] = [
      makePlayer(5, ['5W6_', '5W16_', null, ...Array(28).fill(null)]),
      makePlayer(6, ['6L5_', null, ...Array(29).fill(null)]),
      makePlayer(16, [null, '5W16_', null, ...Array(28).fill(null)]),
    ];
    const step2 = processGameResults(step2Players, 31);
    expect(step2.matches.length).toBe(2);

    const repopulated = repopulateGameResults(step2Players, step2.matches, 31, step2.playerResultsByMatch);

    const p5 = repopulated.find(p => p.rank === 5);
    expect(p5?.gameResults.filter(r => r !== null).length).toBe(2);

    const p6 = repopulated.find(p => p.rank === 6);
    expect(p6?.gameResults.filter(r => r !== null).length).toBe(1);

    const p16 = repopulated.find(p => p.rank === 16);
    expect(p16?.gameResults.filter(r => r !== null).length).toBe(1);
  });

  it('should handle multiple corrections with fresh matches each time', () => {
    const afterFirst: PlayerData[] = [
      makePlayer(5, ['5W16_', null, ...Array(29).fill(null)]),
      makePlayer(16, ['5W16_', null, ...Array(29).fill(null)]),
    ];
    const firstMatches = processGameResults(afterFirst, 31);
    expect(firstMatches.matches.length).toBe(1);

    const afterSecond: PlayerData[] = [
      makePlayer(5, ['5W16_', '5W99_', null, ...Array(28).fill(null)]),
      makePlayer(16, ['5W16_', null, ...Array(29).fill(null)]),
      makePlayer(99, [null, '5W99_', null, ...Array(28).fill(null)]),
    ];
    const secondMatches = processGameResults(afterSecond, 31);
    expect(secondMatches.matches.length).toBe(2);

    const repopulated = repopulateGameResults(afterSecond, secondMatches.matches, 31, secondMatches.playerResultsByMatch);

    const p5 = repopulated.find(p => p.rank === 5);
    expect(p5?.gameResults.filter(r => r !== null).length).toBe(2);

    const p99 = repopulated.find(p => p.rank === 99);
    expect(p99?.gameResults.filter(r => r !== null).length).toBe(1);
  });
});
