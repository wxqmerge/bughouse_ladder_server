/**
 * Shared trophy generation logic
 * Used by both server (tournamentStore) and client (miniGameStore)
 */
const MINI_GAME_DIFFICULTY_ORDER = [
    'Queen_Game.tab',
    'Pawn_Game.tab',
    'Kings_Cross.tab',
    'Pillar_Game.tab',
    'Bishop_Game.tab',
    'BG_Game.tab',
    'bughouse.tab',
];
export function debugLine(col1, col2 = '', col3 = '', col4 = '', col5 = '', col6 = '', col7 = '', col8 = '') {
    return [col1, col2, col3, col4, col5, col6, col7, col8].join('\t');
}
export function copyPlayersToTarget(sourcePlayers, targetPlayers) {
    const sourceMap = new Map();
    for (const player of sourcePlayers) {
        const key = `${player.lastName.toLowerCase()}|${player.firstName.toLowerCase()}`;
        sourceMap.set(key, player);
    }
    const updatedTarget = targetPlayers.map(targetPlayer => {
        const key = `${targetPlayer.lastName.toLowerCase()}|${targetPlayer.firstName.toLowerCase()}`;
        const sourcePlayer = sourceMap.get(key);
        if (sourcePlayer) {
            return {
                ...targetPlayer,
                rating: sourcePlayer.rating,
                nRating: sourcePlayer.nRating,
                trophyEligible: sourcePlayer.trophyEligible,
                grade: sourcePlayer.grade,
                group: sourcePlayer.group,
                num_games: targetPlayer.num_games,
                gameResults: targetPlayer.gameResults,
            };
        }
        return {
            ...targetPlayer,
            num_games: targetPlayer.num_games,
            gameResults: targetPlayer.gameResults,
        };
    });
    const existingKeys = new Set(updatedTarget.map(p => `${p.lastName.toLowerCase()}|${p.firstName.toLowerCase()}`));
    for (const player of sourcePlayers) {
        const key = `${player.lastName.toLowerCase()}|${player.firstName.toLowerCase()}`;
        if (!existingKeys.has(key)) {
            updatedTarget.push({
                ...player,
                gameResults: Array(31).fill(null),
                num_games: 0,
            });
        }
    }
    return updatedTarget;
}
export function mergeGameResults(oldResults, currentResults) {
    const merged = [...currentResults];
    for (let i = 0; i < oldResults.length; i++) {
        if (oldResults[i] && !merged[i]) {
            merged[i] = oldResults[i];
        }
    }
    return merged;
}
function countGames(gameResults) {
    if (!gameResults)
        return 0;
    return gameResults.filter(r => r && r !== '' && r !== '_').length;
}
export function clubLadderGamesPlayed(player) {
    return (player.num_games || 0) + countGames(player.gameResults);
}
export function generateClubLadderTrophies(players, maxTrophies) {
    const trophies = [];
    const seenPlayers = new Set();
    const sortedPlayers = [...players].sort((a, b) => b.nRating - a.nRating);
    function addTrophy(trophy) {
        const key = `${trophy.player}`;
        if (seenPlayers.has(key))
            return false;
        seenPlayers.add(key);
        trophies.push(trophy);
        return true;
    }
    // Step 1: Award 1st place overall - first eligible by rating
    for (const p of sortedPlayers) {
        const g = clubLadderGamesPlayed(p);
        if (addTrophy({
            rank: trophies.length + 1,
            player: `${p.firstName} ${p.lastName}`,
            gr: p.grade,
            rating: p.nRating,
            trophyType: '1st Place',
            miniGameOrGrade: 'Club Ladder',
            gamesPlayed: g,
            totalGames: g,
        })) {
            break;
        }
    }
    // Step 2: Award 2nd place overall - next eligible by rating
    for (const p of sortedPlayers) {
        const g = clubLadderGamesPlayed(p);
        if (addTrophy({
            rank: trophies.length + 1,
            player: `${p.firstName} ${p.lastName}`,
            gr: p.grade,
            rating: p.nRating,
            trophyType: '2nd Place',
            miniGameOrGrade: 'Club Ladder',
            gamesPlayed: g,
            totalGames: g,
        })) {
            break;
        }
    }
    // Step 3: Award 3rd place overall - next eligible by rating
    for (const p of sortedPlayers) {
        const g = clubLadderGamesPlayed(p);
        if (addTrophy({
            rank: trophies.length + 1,
            player: `${p.firstName} ${p.lastName}`,
            gr: p.grade,
            rating: p.nRating,
            trophyType: '3rd Place',
            miniGameOrGrade: 'Club Ladder',
            gamesPlayed: g,
            totalGames: g,
        })) {
            break;
        }
    }
    // Step 4: Award most games - first eligible by total games (num_games + current)
    const sortedByGames = [...players].sort((a, b) => clubLadderGamesPlayed(b) - clubLadderGamesPlayed(a));
    for (const p of sortedByGames) {
        const g = clubLadderGamesPlayed(p);
        if (addTrophy({
            rank: trophies.length + 1,
            player: `${p.firstName} ${p.lastName}`,
            gr: p.grade,
            rating: p.nRating,
            trophyType: 'Most Games',
            miniGameOrGrade: 'Club Ladder',
            gamesPlayed: g,
            totalGames: g,
        })) {
            break;
        }
    }
    // Step 5: Award grade 1st place if t > 4
    if (maxTrophies > 4) {
        const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
        for (const grade of gradeGroups) {
            const gradePlayers = players.filter(p => p.grade === grade).sort((a, b) => b.nRating - a.nRating);
            for (const p of gradePlayers) {
                const g = clubLadderGamesPlayed(p);
                if (addTrophy({
                    rank: trophies.length + 1,
                    player: `${p.firstName} ${p.lastName}`,
                    gr: grade,
                    rating: p.nRating,
                    trophyType: '1st Place',
                    miniGameOrGrade: `Gr ${grade}`,
                    gamesPlayed: g,
                    totalGames: g,
                })) {
                    break;
                }
            }
        }
    }
    // Step 6: Award grade 2nd place if any trophies remain
    if (trophies.length < maxTrophies) {
        const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
        for (const grade of gradeGroups) {
            const gradePlayers = players.filter(p => p.grade === grade).sort((a, b) => b.nRating - a.nRating);
            for (const p of gradePlayers) {
                const g = clubLadderGamesPlayed(p);
                if (addTrophy({
                    rank: trophies.length + 1,
                    player: `${p.firstName} ${p.lastName}`,
                    gr: grade,
                    rating: p.nRating,
                    trophyType: '2nd Place',
                    miniGameOrGrade: `Gr ${grade}`,
                    gamesPlayed: g,
                    totalGames: g,
                })) {
                    break;
                }
            }
        }
    }
    // Step 7: Award grade 3rd place if any trophies remain
    if (trophies.length < maxTrophies) {
        const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
        for (const grade of gradeGroups) {
            const gradePlayers = players.filter(p => p.grade === grade).sort((a, b) => b.nRating - a.nRating);
            for (const p of gradePlayers) {
                const g = clubLadderGamesPlayed(p);
                if (addTrophy({
                    rank: trophies.length + 1,
                    player: `${p.firstName} ${p.lastName}`,
                    gr: grade,
                    rating: p.nRating,
                    trophyType: '3rd Place',
                    miniGameOrGrade: `Gr ${grade}`,
                    gamesPlayed: g,
                    totalGames: g,
                })) {
                    break;
                }
            }
        }
    }
    return trophies;
}
export function generateMiniGameTrophies(players, maxTrophies, miniGameFiles) {
    const trophies = [];
    const seenPlayers = new Set();
    const existingFiles = miniGameFiles.map(f => f.fileName);
    const m = existingFiles.length;
    const t = maxTrophies;
    function getPlayerTotalGames(player) {
        let total = 0;
        for (const mgd of miniGameFiles) {
            const p = mgd.players.find(p => p.rank === player.rank);
            if (!p?.gameResults)
                continue;
            total += p.gameResults.filter((r) => r && r !== '' && r !== '_').length;
        }
        return total;
    }
    function addTrophy(trophy) {
        const key = `${trophy.player}`;
        if (seenPlayers.has(key))
            return false;
        seenPlayers.add(key);
        trophies.push(trophy);
        return true;
    }
    // Pre-calculate total games for all players
    const playerTotalGames = new Map();
    for (const p of players) {
        playerTotalGames.set(`${p.firstName} ${p.lastName}`, getPlayerTotalGames(p));
    }
    // Step 1: Award 1st place for each mini-game - always
    for (const fileName of MINI_GAME_DIFFICULTY_ORDER) {
        const mgd = miniGameFiles.find(f => f.fileName === fileName);
        if (!mgd || mgd.players.length === 0)
            continue;
        const playersWithGames = mgd.players.filter(p => {
            if (!p.gameResults)
                return false;
            return p.gameResults.some(r => r && r !== '' && r !== '_');
        });
        const sortedPlayers = playersWithGames.sort((a, b) => b.nRating - a.nRating);
        for (const p of sortedPlayers) {
            if (seenPlayers.has(`${p.firstName} ${p.lastName}`))
                continue;
            const miniGameGames = p.gameResults?.filter(r => r && r !== '' && r !== '_')?.length || 0;
            addTrophy({
                rank: trophies.length + 1,
                player: `${p.firstName} ${p.lastName}`,
                gr: p.grade,
                rating: p.nRating,
                trophyType: '1st Place',
                miniGameOrGrade: fileName.replace('.tab', ''),
                gamesPlayed: miniGameGames,
                totalGames: playerTotalGames.get(`${p.firstName} ${p.lastName}`) || 0,
            });
            break;
        }
    }
    // Step 2: Award 2nd place for each mini-game - only if t > m
    if (t > m) {
        for (const fileName of MINI_GAME_DIFFICULTY_ORDER) {
            const mgd = miniGameFiles.find(f => f.fileName === fileName);
            if (!mgd || mgd.players.length === 0)
                continue;
            const playersWithGames = mgd.players.filter(p => {
                if (!p.gameResults)
                    return false;
                return p.gameResults.some((r) => r && r !== '' && r !== '_');
            });
            const sortedPlayers = playersWithGames.sort((a, b) => b.nRating - a.nRating);
            for (const p of sortedPlayers) {
                if (seenPlayers.has(`${p.firstName} ${p.lastName}`))
                    continue;
                const miniGameGames = p.gameResults?.filter((r) => r && r !== '' && r !== '_')?.length || 0;
                addTrophy({
                    rank: trophies.length + 1,
                    player: `${p.firstName} ${p.lastName}`,
                    gr: p.grade,
                    rating: p.nRating,
                    trophyType: '2nd Place',
                    miniGameOrGrade: fileName.replace('.tab', ''),
                    gamesPlayed: miniGameGames,
                    totalGames: playerTotalGames.get(`${p.firstName} ${p.lastName}`) || 0,
                });
                break;
            }
        }
    }
    // Step 3: Award grade 1st place - only if t > 2*m
    if (t > 2 * m) {
        const remainingPlayers = players.filter(p => !seenPlayers.has(`${p.firstName} ${p.lastName}`));
        const gradeGroups = [...new Set(remainingPlayers.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
        for (const grade of gradeGroups) {
            const gradePlayers = remainingPlayers.filter(p => p.grade === grade)
                .sort((a, b) => (playerTotalGames.get(`${b.firstName} ${b.lastName}`) || 0) - (playerTotalGames.get(`${a.firstName} ${a.lastName}`) || 0));
            if (gradePlayers.length > 0) {
                const p = gradePlayers[0];
                addTrophy({
                    rank: trophies.length + 1,
                    player: `${p.firstName} ${p.lastName}`,
                    gr: grade,
                    rating: p.nRating,
                    trophyType: '1st Place',
                    miniGameOrGrade: `Gr ${grade}`,
                    gamesPlayed: p.gameResults?.filter(r => r && r !== '' && r !== '_')?.length || 0,
                    totalGames: playerTotalGames.get(`${p.firstName} ${p.lastName}`) || 0,
                });
            }
        }
    }
    return trophies;
}
//# sourceMappingURL=trophyGeneration.js.map