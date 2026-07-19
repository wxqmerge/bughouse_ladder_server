import { titleToFileName, MINI_GAMES_WITH_BUGHOUSE } from "../../shared/utils/constants";

export const ALL_TITLES: string[] = ["Ladder", ...MINI_GAMES_WITH_BUGHOUSE];

export function getVisibleTitles(isAdmin: boolean, availableMiniGames: string[]): string[] {
  return isAdmin
    ? ALL_TITLES
    : ALL_TITLES.filter((title) => {
        if (title === "Ladder") return true;
        const fileName = titleToFileName(title);
        return availableMiniGames.includes(fileName);
      });
}


