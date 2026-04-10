import { useState, useRef } from "react";
import LadderForm from "./components/LadderForm";
import Settings from "./components/Settings";
import { loadSampleData } from "./components/LadderForm";
import type { PlayerData } from "./utils/hashUtils";
import { getNextTitle, processNewDayTransformations } from "./utils/constants";
import "./css/index.css";

function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [triggerWalkthrough, setTriggerWalkthrough] = useState(false);
  const recalculateRef = useRef<(() => void) | undefined>(undefined);

  const handleReset = () => {
    const samplePlayers = loadSampleData();
    localStorage.setItem("ladder_players", JSON.stringify(samplePlayers));
    window.location.reload();
  };

  const handleClearAll = () => {
    const emptyPlayers: Record<number, PlayerData> = {};
    localStorage.setItem("ladder_players", JSON.stringify(emptyPlayers));
    localStorage.removeItem("ladder_settings");
    window.location.reload();
  };

  const processNewDay = (reRank: boolean) => {
    const playersJson = localStorage.getItem("ladder_players");
    if (playersJson) {
      try {
        const players: Record<number, PlayerData> = JSON.parse(playersJson);
        const currentTitle =
          localStorage.getItem("ladder_project_name") ||
          "Bughouse Chess Ladder";
        const nextTitle = getNextTitle(currentTitle);

        const playerArray = Object.values(players) as PlayerData[];
        const finalPlayers = processNewDayTransformations(playerArray, reRank);

        localStorage.setItem("ladder_players", JSON.stringify(finalPlayers));
        localStorage.setItem("ladder_project_name", nextTitle);
        localStorage.removeItem("ladder_settings");
        window.location.reload();
      } catch (err) {
        console.error("Failed to process new day:", err);
      }
    }
  };

  const triggerNewDay = (reRank: boolean) => {
    console.log(`>>> [NEW DAY TRIGGERED] reRank=${reRank}`);
    // First, trigger recalculate ratings to check for errors
    if (recalculateRef.current) {
      // Set a flag indicating New Day is pending
      localStorage.setItem("ladder_pending_newday", JSON.stringify({ reRank }));
      console.log(
        `>>> [NEW DAY] Pending flag set: ${JSON.stringify({ reRank })}`,
      );
      // Call recalculate - if there are errors, it will show the error dialog
      // and not complete, so New Day won't proceed
      recalculateRef.current();
    } else {
      // Fallback: just process New Day directly
      console.warn(
        ">>> [NEW DAY] Recalculate ref not available, using fallback",
      );
      processNewDay(reRank);
    }
  };

  const handleNewDay = () => {
    triggerNewDay(false);
  };

  const handleNewDayWithReRank = () => {
    triggerNewDay(true);
  };

  const handleWalkThroughReports = () => {
    setTriggerWalkthrough(true);
  };

  const handleSetRecalculateRef = (ref: () => void) => {
    recalculateRef.current = ref;
  };

  return (
    <>
      <LadderForm
        setShowSettings={setShowSettings}
        triggerWalkthrough={triggerWalkthrough}
        setTriggerWalkthrough={setTriggerWalkthrough}
        onSetRecalculateRef={handleSetRecalculateRef}
      />
      {showSettings && (
        <Settings
          onClose={() => setShowSettings(false)}
          onReset={handleReset}
          onClearAll={handleClearAll}
          onNewDay={handleNewDay}
          onNewDayWithReRank={handleNewDayWithReRank}
          onWalkThroughReports={handleWalkThroughReports}
        />
      )}
    </>
  );
}

export default App;
