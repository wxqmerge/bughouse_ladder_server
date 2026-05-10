import { MINI_GAMES_WITH_BUGHOUSE, titleToFileName } from "../../shared/utils/constants";

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

export function createTitleMenuItem(
  title: string,
  isAdmin: boolean,
  availableMiniGames: string[],
  onClick: () => void
): { label: string; onClick: () => void; disabled: boolean } {
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
      onClick();
    },
    disabled: isDisabled,
  };
}
