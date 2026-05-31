import { PlayerData } from '../types/index.js';

export const IDENTITY_FIELDS = [
	'rank', 'group', 'lastName', 'firstName', 'rating',
	'trophyEligible', 'grade', 'num_games', 'attendance',
	'phone', 'info', 'school', 'room'
] as const;

export type IdentityField = (typeof IDENTITY_FIELDS)[number];

export function isIdentityField(field: string): field is IdentityField {
	return IDENTITY_FIELDS.includes(field as IdentityField);
}

/**
 * For each mini-game player, replace identity fields with club ladder identity.
 * nRating and gameResults are preserved from the mini-game file.
 * Players not found in club ladder keep their existing identity.
 */
export function mergeIdentityFromClubLadder(
	miniGamePlayers: PlayerData[],
	clubPlayers: PlayerData[]
): PlayerData[] {
	const clubByRank = new Map<number, PlayerData>();
	for (const p of clubPlayers) {
		clubByRank.set(p.rank, p);
	}

	return miniGamePlayers.map(mgPlayer => {
		const clubPlayer = clubByRank.get(mgPlayer.rank);
		if (!clubPlayer) {
			return mgPlayer;
		}

		const merged: PlayerData = { ...clubPlayer };
		// Preserve mini-game-specific fields
		merged.nRating = mgPlayer.nRating;
		merged.gameResults = mgPlayer.gameResults || clubPlayer.gameResults;
		return merged;
	});
}

/**
 * Given incoming players from a mini-game save and the last-known club ladder
 * snapshot, detect which players had identity changes. Returns:
 * - identityUpdates: players whose identity fields changed (to be written to club ladder)
 * - miniGamePlayers: all players with club identity + original nRating/gameResults
 */
export function splitIdentityChanges(
	incomingPlayers: PlayerData[],
	clubSnapshot: PlayerData[]
): { identityUpdates: PlayerData[]; miniGamePlayers: PlayerData[] } {
	const clubByRank = new Map<number, PlayerData>();
	for (const p of clubSnapshot) {
		clubByRank.set(p.rank, p);
	}

	const identityUpdates: PlayerData[] = [];
	const miniGamePlayers: PlayerData[] = [];

	for (const incoming of incomingPlayers) {
		const clubPlayer = clubByRank.get(incoming.rank);
		if (!clubPlayer) {
			// Player not in club ladder — keep as-is
			miniGamePlayers.push(incoming);
			continue;
		}

		// Check if any identity field changed
		let identityChanged = false;
		for (const field of IDENTITY_FIELDS) {
			if (field === 'rank') continue;
			if (incoming[field] !== clubPlayer[field]) {
				identityChanged = true;
				break;
			}
		}

	if (identityChanged) {
			// Only copy identity fields to avoid overwriting club nRating/gameResults
			const identityOnly: PlayerData = { ...clubPlayer };
			for (const field of IDENTITY_FIELDS) {
				(identityOnly as any)[field] = (incoming as any)[field];
			}
			identityUpdates.push(identityOnly);
		}

		// Always merge: club identity + mini-game nRating/gameResults
		const merged: PlayerData = { ...clubPlayer };
		merged.nRating = incoming.nRating;
		merged.gameResults = incoming.gameResults || clubPlayer.gameResults;
		miniGamePlayers.push(merged);
	}

	return { identityUpdates, miniGamePlayers };
}
