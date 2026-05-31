import { titleToFileName } from "../../shared/utils/constants";

export const ALL_TITLES = ["Ladder", "Bughouse", "BG_Game", "Bishop_Game", "Pillar_Game", "Kings_Cross", "Pawn_Game", "Queen_Game"];

export function getVisibleTitles(isAdmin: boolean, availableMiniGames: string[]): string[] {
  return isAdmin
    ? ALL_TITLES
    : ALL_TITLES.filter((title) => {
        if (title === "Ladder") return true;
        const fileName = titleToFileName(title);
        return availableMiniGames.includes(fileName);
      });
}


