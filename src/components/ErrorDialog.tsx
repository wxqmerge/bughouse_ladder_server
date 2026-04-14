import { useState, useEffect, useRef } from "react";
import { X, Plus } from "lucide-react";
import type { ValidationResult, PlayerData } from "../utils/hashUtils";
import { updatePlayerGameData } from "../utils/hashUtils";
import { getValidationErrorMessage } from "../utils/constants";

interface ErrorDialogProps {
  error: ValidationResult | null;
  players: PlayerData[];
  onClose: () => void;
  onSubmit: (correctedString: string) => void;
  onClearCell?: () => void;
  mode: "error-correction" | "walkthrough" | "game-entry" | "recalculate" | "enter-games";
  walkthroughErrors?: ValidationResult[];
  walkthroughIndex?: number;
  onWalkthroughNext?: () => void;
  onWalkthroughPrev?: () => void;
  entryCell?: { playerRank: number; round: number };
  existingValue?: string;
  onUpdatePlayerData?: (
    playerRank: number,
    roundIndex: number,
    resultString: string,
  ) => void;
  totalRounds?: number;
  onEnterRecalculateSave?: (correctedString: string) => void;
  isAdmin?: boolean;
  onAddPlayer?: () => void;
}

/**
 * Extract result codes (W/L/D) from a result string
 * @example extractResults("5W6") → ["W"]
 * @example extractResults("3WL4") → ["W", "L"]
 * @example extractResults("4:5WW6:7") → ["W", "W"]
 */
function extractResults(resultString: string): string[] {
  const results = resultString.replace(/[^WLD]/gi, '').split('');
  return results;
}

/**
 * Format result codes as readable text
 * @param results - Array of result codes (e.g., ["W", "L"])
 * @param capitalizeFirst - Whether to capitalize first letter (for team games)
 * @example formatResultText(["W"], false) → "won against"
 * @example formatResultText(["L"], false) → "lost to"
 * @example formatResultText(["D"], false) → "drew with"
 * @example formatResultText(["W", "W"], true) → "Won and Won against"
 * @example formatResultText(["W", "L"], false) → "won and lost against"
 */
function formatResultText(results: string[], capitalizeFirst = false): string {
  if (results.length === 0) return '';
  
  if (results.length === 1) {
    const r = results[0].toUpperCase();
    const text = r === 'W' ? 'won against' : 
                 r === 'L' ? 'lost to' : 
                 'drew with';
    return capitalizeFirst ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }
  
  // Multiple results - join with "and"
  const formatted = results.map(r => {
    const upper = r.toUpperCase();
    return upper === 'W' ? 'won' : 
           upper === 'L' ? 'lost' : 
           'drew';
  });
  
  let resultText = formatted.join(' and ') + ' against';
  if (capitalizeFirst) {
    resultText = resultText.charAt(0).toUpperCase() + resultText.slice(1);
  }
  return resultText;
}

export default function ErrorDialog({
  error,
  players,
  onClose,
  onSubmit,
  onClearCell,
  mode,
  walkthroughErrors,
  walkthroughIndex,
  onWalkthroughNext,
  onWalkthroughPrev,
  entryCell,
  existingValue,
  onUpdatePlayerData,
  totalRounds,
  onEnterRecalculateSave,
  isAdmin = false,
  onAddPlayer,
}: ErrorDialogProps) {
  const [correctedResult, setCorrectedResult] = useState<string>(
    existingValue?.replace(/_$/, "") || "",
  );
  const [currentInputValue, setCurrentInputValue] = useState<string>("");
  const [cursorPosition, setCursorPosition] = useState<number>(0);
  const [parseStatus, setParseStatus] = useState<{
    isValid: boolean;
    error?: number;
    message?: string;
  } | null>(null);
  const [parsedGameData, setParsedGameData] = useState<{
    player1Rank: number;
    player2Rank: number;
    player3Rank: number;
    player4Rank: number;
  } | null>(null);
  const [displayPlayer1, setDisplayPlayer1] = useState<PlayerData | null>(null);
  const [displayPlayer2, setDisplayPlayer2] = useState<PlayerData | null>(null);
  const [displayPlayer3, setDisplayPlayer3] = useState<PlayerData | null>(null);
  const [displayPlayer4, setDisplayPlayer4] = useState<PlayerData | null>(null);
  const [extractedResults, setExtractedResults] = useState<string[]>([]);

  const displayOriginalString = error
    ? error.originalString?.toUpperCase() || ""
    : "";
  const inputRef = useRef<HTMLInputElement>(null);
  const justOpened = useRef(false);

  // Keyboard shortcuts: Ctrl+letter for buttons
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;

      const key = e.key.toLowerCase();

      switch (key) {
        case "s":
          e.preventDefault();
          handleSubmit(e as unknown as React.FormEvent);
          break;
        case "c":
          e.preventDefault();
          handleClearCell();
          break;
        case "p":
          e.preventDefault();
          onWalkthroughPrev?.();
          break;
        case "n":
          e.preventDefault();
          onWalkthroughNext?.();
          break;
        case "x":
          e.preventDefault();
          onClose();
          break;
        case "escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onWalkthroughPrev, onWalkthroughNext, onClose]);

  // Sync input value when existingValue changes (e.g., clicking different cell)
  useEffect(() => {
    const value = existingValue?.replace(/_$/, "") || "";
    setCurrentInputValue(value);
  }, [existingValue]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (existingValue) {
      const value = existingValue.replace(/_$/, "").toUpperCase();
      setCorrectedResult(value);

      // Parse the original string to show player info immediately
      const validation = updatePlayerGameData(value, true);

      // Set parse status
      if (validation.isValid && value !== "") {
        setParseStatus({ isValid: true });
      } else if (validation.error) {
        setParseStatus({
          isValid: false,
          error: validation.error,
          message: validation.message || getValidationErrorMessage(validation.error),
        });
      }

      // Always try to display parsed player info if available
      if (
        value !== "" &&
        ((validation.parsedPlayer1Rank || 0) > 0 ||
          (validation.parsedPlayer2Rank || 0) > 0 ||
          (validation.parsedPlayer3Rank || 0) > 0 ||
          (validation.parsedPlayer4Rank || 0) > 0)
      ) {
        setParsedGameData({
          player1Rank: validation.parsedPlayer1Rank || 0,
          player2Rank: validation.parsedPlayer2Rank || 0,
          player3Rank: validation.parsedPlayer3Rank || 0,
          player4Rank: validation.parsedPlayer4Rank || 0,
        });

        const p1 =
          (validation.parsedPlayer1Rank || 0) > 0 &&
          (validation.parsedPlayer1Rank || 0) <= players.length
            ? players[(validation.parsedPlayer1Rank || 0) - 1] || null
            : null;
        const p2 =
          (validation.parsedPlayer2Rank || 0) > 0 &&
          (validation.parsedPlayer2Rank || 0) <= players.length
            ? players[(validation.parsedPlayer2Rank || 0) - 1] || null
            : null;
        const p3 =
          (validation.parsedPlayer3Rank || 0) > 0 &&
          (validation.parsedPlayer3Rank || 0) <= players.length
            ? players[(validation.parsedPlayer3Rank || 0) - 1] || null
            : null;
        const p4 =
          (validation.parsedPlayer4Rank || 0) > 0 &&
          (validation.parsedPlayer4Rank || 0) <= players.length
            ? players[(validation.parsedPlayer4Rank || 0) - 1] || null
            : null;

        setDisplayPlayer1(p1);
        setDisplayPlayer2(p2);
        setDisplayPlayer3(p3);
        setDisplayPlayer4(p4);
        
        // Extract results for display
        const results = extractResults(value);
        setExtractedResults(results);
      }
    } else if (error && error.originalString) {
      const original = error.originalString.toUpperCase();
      setCorrectedResult(original);

      // Parse the original string to show player info immediately
      const validation = updatePlayerGameData(original, true);

      // Set parse status
      if (validation.isValid && original !== "") {
        setParseStatus({ isValid: true });
      } else if (validation.error) {
        setParseStatus({
          isValid: false,
          error: validation.error,
          message: validation.message || getValidationErrorMessage(validation.error),
        });
      }

      // Always try to display parsed player info if available
      if (
        original !== "" &&
        ((validation.parsedPlayer1Rank || 0) > 0 ||
          (validation.parsedPlayer2Rank || 0) > 0 ||
          (validation.parsedPlayer3Rank || 0) > 0 ||
          (validation.parsedPlayer4Rank || 0) > 0)
      ) {
        setParsedGameData({
          player1Rank: validation.parsedPlayer1Rank || 0,
          player2Rank: validation.parsedPlayer2Rank || 0,
          player3Rank: validation.parsedPlayer3Rank || 0,
          player4Rank: validation.parsedPlayer4Rank || 0,
        });

        const p1 =
          (validation.parsedPlayer1Rank || 0) > 0 &&
          (validation.parsedPlayer1Rank || 0) <= players.length
            ? players[(validation.parsedPlayer1Rank || 0) - 1] || null
            : null;
        const p2 =
          (validation.parsedPlayer2Rank || 0) > 0 &&
          (validation.parsedPlayer2Rank || 0) <= players.length
            ? players[(validation.parsedPlayer2Rank || 0) - 1] || null
            : null;
        const p3 =
          (validation.parsedPlayer3Rank || 0) > 0 &&
          (validation.parsedPlayer3Rank || 0) <= players.length
            ? players[(validation.parsedPlayer3Rank || 0) - 1] || null
            : null;
        const p4 =
          (validation.parsedPlayer4Rank || 0) > 0 &&
          (validation.parsedPlayer4Rank || 0) <= players.length
            ? players[(validation.parsedPlayer4Rank || 0) - 1] || null
            : null;

        setDisplayPlayer1(p1);
        setDisplayPlayer2(p2);
        setDisplayPlayer3(p3);
        setDisplayPlayer4(p4);
        
        // Extract results for display
        const results = extractResults(original);
        setExtractedResults(results);
      }
    } else {
      setCorrectedResult("");
      setExtractedResults([]);
    }
  }, [existingValue, mode, error, players]);

  useEffect(() => {
    // Mark that dialog just opened
    justOpened.current = true;
  }, [existingValue, error]);

  useEffect(() => {
    // Focus input when dialog opens (selection handled in onFocus)
    if (justOpened.current && inputRef.current) {
      inputRef.current.focus();
    }
  }, [existingValue, error]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Restore cursor position after input changes
  useEffect(() => {
    if (inputRef.current && cursorPosition > 0) {
      inputRef.current.setSelectionRange(cursorPosition, cursorPosition);
    }
  }, [cursorPosition]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log(">>> [BUTTON PRESSED] Save (Game Result)");
    // Use the latest input value from state
    const rawValue = currentInputValue || "";
    const filteredValue = rawValue.toUpperCase().replace(/[^0-9WLD:]/g, "");

    // Final validation before submit
    const validation = updatePlayerGameData(filteredValue, true);
    if (validation.isValid) {
      setParseStatus({ isValid: true });
    }

    onSubmit(filteredValue);
  };

  const handleEnterRecalculateSave = (e: React.FormEvent) => {
    e.preventDefault();
    console.log(">>> [BUTTON PRESSED] Enter_Recalculate_Save");
    // Use the latest input value from state
    const rawValue = currentInputValue || "";
    const filteredValue = rawValue.toUpperCase().replace(/[^0-9WLD:]/g, "");

    // Final validation before submit
    const validation = updatePlayerGameData(filteredValue, true);
    if (validation.isValid) {
      setParseStatus({ isValid: true });
    }

    // Call the enter-recalculate-save handler if provided
    if (onEnterRecalculateSave) {
      onEnterRecalculateSave(filteredValue);
    } else {
      // Fallback to regular submit
      onSubmit(filteredValue);
    }
  };

  const handleClearCell = () => {
    console.log(">>> [BUTTON PRESSED] Clear Cell");
    setCorrectedResult("");
    setCurrentInputValue("");
    setParseStatus(null);
    setParsedGameData(null);
    setDisplayPlayer1(null);
    setDisplayPlayer2(null);
    setDisplayPlayer3(null);
    setDisplayPlayer4(null);
    setExtractedResults([]);

    // Use onClearCell prop if provided (clears all matching cells)
    if (onClearCell) {
      console.log(">>> [CLEAR CELL] Calling onClearCell callback");
      onClearCell();
      
      // In recalculate/walkthrough mode, don't close dialog - let user continue
      if (mode === "recalculate" || mode === "walkthrough") {
        return;
      }
      
      // In other modes, close the dialog after clearing
      onClose();
      return;
    }

    // Fallback for when onClearCell is not provided
    if (mode === "walkthrough" && entryCell && onUpdatePlayerData) {
      onUpdatePlayerData(entryCell.playerRank, entryCell.round, "");
      onClose();
      if (onWalkthroughNext) {
        onWalkthroughNext();
      }
    } else if (mode === "recalculate" && onSubmit) {
      onSubmit("");
    } else if (mode === "error-correction" && onSubmit) {
      onSubmit("");
    } else if (mode === "game-entry" && onUpdatePlayerData && entryCell) {
      onUpdatePlayerData(entryCell.playerRank, entryCell.round, "");
      onClose();
    } else {
      onClose();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");

    // Check if paste contains tab-delimited results
    const results = pastedText.split("\t").filter((r) => r.trim() !== "");

    if (results.length > 1) {
      // Multiple results detected - log and store them
      console.log(
        `>>> [PASTE DETECTED] ${results.length} tab-delimited results`,
      );
      const cleanedResults = results.map((r) =>
        r.toUpperCase().replace(/[^0-9WLD:]/g, ""),
      );
      results.forEach((result, idx) => {
        console.log(`>>> [PASTE RESULT] ${idx + 1}: "${result.trim()}"`);
      });

      // Store in window for LadderForm to access
      (window as any).__pasteResults = cleanedResults;

      // Use first result
      const firstResult = cleanedResults[0];
      setCurrentInputValue(firstResult);
      if (inputRef.current) {
        inputRef.current.value = firstResult;
      }

      // Update validation
      const validation = updatePlayerGameData(firstResult, true);
      if (validation.isValid) {
        setParseStatus({ isValid: true });
      } else {
        setParseStatus({ isValid: false, error: validation.error });
      }

      console.log(
        `>>> [PASTE RESULT] Pasted first result: "${firstResult}" (${cleanedResults.length - 1} remaining)`,
      );
    } else {
      // Single value paste - use default browser behavior
      const singleValue = pastedText.toUpperCase().replace(/[^0-9WLD:]/g, "");
      setCurrentInputValue(singleValue);
      if (inputRef.current) {
        inputRef.current.value = singleValue;
      }
      console.log(`>>> [PASTE RESULT] Single value: "${singleValue}"`);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Save cursor position before any changes
    const cursorPos = e.target.selectionStart || 0;

    // Filter the input for display purposes without changing value state
    const rawValue = e.target.value;

    // Check for tab-delimited paste (fallback if onPaste didn't trigger)
    if (rawValue.includes("\t")) {
      const results = rawValue.split("\t").filter((r) => r.trim() !== "");
      console.log(
        `>>> [PASTE DETECTED] ${results.length} tab-delimited results`,
      );
      results.forEach((result, idx) => {
        console.log(`>>> [PASTE RESULT] ${idx + 1}: "${result.trim()}"`);
      });

      // Use first result
      const firstResult = results[0].toUpperCase().replace(/[^0-9WLD:]/g, "");
      setCurrentInputValue(firstResult);
      if (inputRef.current) {
        inputRef.current.value = firstResult;
      }
      setCursorPosition(0);

      // Update validation
      const validation = updatePlayerGameData(firstResult, true);
      if (validation.isValid) {
        setParseStatus({ isValid: true });
      } else {
        setParseStatus({
          isValid: false,
          error: validation.error,
          message: validation.message || getValidationErrorMessage(validation.error || 0),
        });
      }

      console.log(`>>> [PASTE RESULT] Pasted first result: "${firstResult}"`);
      return;
    }

    setCurrentInputValue(rawValue);
    setCursorPosition(cursorPos);
    const filteredValue = rawValue.toUpperCase().replace(/[^0-9WLD:]/g, "");
    if (inputRef.current && filteredValue !== rawValue) {
      inputRef.current.value = filteredValue;
    }

    // Update parseStatus and parsedGameData in real-time for display
    const validation = updatePlayerGameData(filteredValue, true);

    if (filteredValue.trim()) {
      if (validation.error) {
        setParseStatus({
          isValid: false,
          error: validation.error,
          message: validation.message || getValidationErrorMessage(validation.error),
        });
      } else if (validation.isValid) {
        setParseStatus({ isValid: true });
      }

      // Update parsed player data for display in real-time
      if (
        (validation.parsedPlayer1Rank || 0) > 0 ||
        (validation.parsedPlayer2Rank || 0) > 0 ||
        (validation.parsedPlayer3Rank || 0) > 0 ||
        (validation.parsedPlayer4Rank || 0) > 0
      ) {
        setParsedGameData({
          player1Rank: validation.parsedPlayer1Rank || 0,
          player2Rank: validation.parsedPlayer2Rank || 0,
          player3Rank: validation.parsedPlayer3Rank || 0,
          player4Rank: validation.parsedPlayer4Rank || 0,
        });

        const p1 =
          (validation.parsedPlayer1Rank || 0) > 0 &&
          (validation.parsedPlayer1Rank || 0) <= players.length
            ? players[(validation.parsedPlayer1Rank || 0) - 1] || null
            : null;
        const p2 =
          (validation.parsedPlayer2Rank || 0) > 0 &&
          (validation.parsedPlayer2Rank || 0) <= players.length
            ? players[(validation.parsedPlayer2Rank || 0) - 1] || null
            : null;
        const p3 =
          (validation.parsedPlayer3Rank || 0) > 0 &&
          (validation.parsedPlayer3Rank || 0) <= players.length
            ? players[(validation.parsedPlayer3Rank || 0) - 1] || null
            : null;
        const p4 =
          (validation.parsedPlayer4Rank || 0) > 0 &&
          (validation.parsedPlayer4Rank || 0) <= players.length
            ? players[(validation.parsedPlayer4Rank || 0) - 1] || null
            : null;

        setDisplayPlayer1(p1);
        setDisplayPlayer2(p2);
        setDisplayPlayer3(p3);
        setDisplayPlayer4(p4);
        
        // Extract results for display
        const results = extractResults(filteredValue);
        setExtractedResults(results);
      }
    }
  };

  const isWalkthrough = mode === "walkthrough";
  const isGameEntry = mode === "game-entry";
  const isRecalculate = mode === "recalculate";
  const isEnterGames = mode === "enter-games";

  const displayError = error;
  const displayIndex = walkthroughIndex ?? 0;
  const displayTotal = totalRounds ?? walkthroughErrors?.length ?? 1;
  const displayCell = entryCell ?? { playerRank: 0, round: 0 };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "0.5rem",
          padding: "1.5rem",
          maxWidth: "500px",
          width: "40%",
          maxHeight: "80vh",
          overflow: "auto",
          marginLeft: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <h2
            style={{
              fontSize: "1.25rem",
              fontWeight: "600",
              color: isEnterGames
                ? "#8b5cf6"
                : isGameEntry
                  ? "#3b82f6"
                  : isRecalculate
                    ? "#10b981"
                    : isWalkthrough
                      ? "#f59e0b"
                      : "#ef4444",
            }}
          >
            {isEnterGames
              ? "Enter Games"
              : isGameEntry
                ? "Edit Game Result"
                : isRecalculate
                  ? `Recalculate Error ${displayIndex + 1} of ${displayTotal}`
                  : isWalkthrough
                    ? `Report Walkthrough - Report ${displayIndex + 1} of ${displayTotal}`
                    : `Correction Required - Round ${displayCell.round + 1} of ${displayTotal}`}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "0.25rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={24} color="#6b7280" />
          </button>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          {(isGameEntry || isEnterGames) && (
            <p
              style={{
                fontSize: "0.875rem",
                color: "#6b7280",
                marginBottom: "0.5rem",
              }}
            >
              <strong>Entering:</strong> Round {displayCell.round + 1} for Player{" "}
              {entryCell && displayPlayer1
                ? entryCell.playerRank +
                  ": " +
                  displayPlayer1.firstName +
                  " " +
                  displayPlayer1.lastName
                : "Unknown"}
            </p>
          )}
          {parsedGameData && (
            <>
              {/* 2-Player Game */}
              {parsedGameData.player4Rank === 0 && (
                <>
                  {displayPlayer1 && (
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "#6b7280",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <strong>First Player:</strong>{" "}
                      {displayPlayer1.firstName +
                        " " +
                        displayPlayer1.lastName +
                        " (" +
                        displayPlayer1.rank +
                        ")"}
                    </p>
                  )}
                  {extractedResults.length > 0 && (
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "#059669",
                        fontWeight: "600",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {formatResultText(extractedResults, false)}
                    </p>
                  )}
                  {displayPlayer2 && (
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "#6b7280",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <strong>Second Player:</strong>{" "}
                      {displayPlayer2.firstName +
                        " " +
                        displayPlayer2.lastName +
                        " (" +
                        displayPlayer2.rank +
                        ")"}
                    </p>
                  )}
                </>
              )}
              
              {/* 4-Player Team Game */}
              {parsedGameData.player4Rank !== 0 && (
                <>
                  {/* Team 1 */}
                  {displayPlayer1 && (
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "#6b7280",
                        marginBottom: "0.25rem",
                      }}
                    >
                      <strong>First Player:</strong>{" "}
                      {displayPlayer1.firstName +
                        " " +
                        displayPlayer1.lastName +
                        " (" +
                        displayPlayer1.rank +
                        ")"}
                    </p>
                  )}
                  {displayPlayer2 && (
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "#6b7280",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <strong>Second Player:</strong>{" "}
                      {displayPlayer2.firstName +
                        " " +
                        displayPlayer2.lastName +
                        " (" +
                        displayPlayer2.rank +
                        ")"}
                    </p>
                  )}
                  
                  {/* Result between teams */}
                  {extractedResults.length > 0 && (
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "#059669",
                        fontWeight: "600",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {formatResultText(extractedResults, true)}
                    </p>
                  )}
                  
                  {/* Team 2 */}
                  {displayPlayer3 && (
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "#6b7280",
                        marginBottom: "0.25rem",
                      }}
                    >
                      <strong>Third Player:</strong>{" "}
                      {displayPlayer3.firstName +
                        " " +
                        displayPlayer3.lastName +
                        " (" +
                        displayPlayer3.rank +
                        ")"}
                    </p>
                  )}
                  {displayPlayer4 && (
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "#6b7280",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <strong>Fourth Player:</strong>{" "}
                      {displayPlayer4.firstName +
                        " " +
                        displayPlayer4.lastName +
                        " (" +
                        displayPlayer4.rank +
                        ")"}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {correctedResult.trim() && parsedGameData && (
          <p
            style={{
              fontSize: "0.75rem",
              color: "#0369a1",
              backgroundColor: "#f0f9ff",
              padding: "0.5rem",
              borderRadius: "0.25rem",
              marginBottom: "1rem",
            }}
          >
            Parsed:{" "}
            {(() => {
              const currentInput = currentInputValue || "";
              return currentInput.toUpperCase().replace(/[^0-9WLD:]/g, "");
            })()}{" "}
            results: players [{parsedGameData.player1Rank},{" "}
            {parsedGameData.player2Rank}, {parsedGameData.player3Rank},{" "}
            {parsedGameData.player4Rank}]
          </p>
        )}

        {!isGameEntry && displayError && (
          <div style={{ marginBottom: "1rem" }}>
            <p
              style={{
                fontSize: "0.875rem",
                color: "#6b7280",
                marginBottom: "0.5rem",
              }}
            >
              <strong>Original String:</strong>{" "}
              <code
                style={{
                  backgroundColor: "#f3f4f6",
                  padding: "0.25rem 0.5rem",
                  borderRadius: "0.25rem",
                  fontSize: "0.75rem",
                }}
              >
                {displayOriginalString || "(empty)"}
              </code>
            </p>
            <p
              style={{
                fontSize: "0.875rem",
                color: "#ef4444",
                marginBottom: "0.5rem",
              }}
            >
              <strong>Error:</strong>{" "}
              {parseStatus && !parseStatus.isValid
                ? parseStatus.message ||
                  getValidationErrorMessage(displayError.error)
                : getValidationErrorMessage(displayError.error)}
            </p>
            {displayError.error === 10 && displayError.conflictingResults && (
              <div
                style={{
                  marginTop: "0.5rem",
                  padding: "0.75rem",
                  backgroundColor: "#fef3c7",
                  borderRadius: "0.25rem",
                  border: "1px solid #f59e0b",
                }}
              >
                <p
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: "600",
                    color: "#92400e",
                    marginBottom: "0.5rem",
                  }}
                >
                  Conflicting Results (all players in this match):
                </p>
                {displayError.conflictingResults.map((conflict, idx) => {
                  const player = players.find(
                    (p) => p.rank === conflict.playerRank,
                  );
                  return (
                    <div
                      key={idx}
                      style={{
                        fontSize: "0.75rem",
                        color: "#78350f",
                        marginBottom: "0.25rem",
                        padding: "0.25rem",
                        backgroundColor:
                          conflict.playerRank === displayError.playerRank
                            ? "#fde68a"
                            : "transparent",
                        borderRadius: "0.25rem",
                      }}
                    >
                      <strong>Player {conflict.playerRank}</strong>
                      {player && (
                        <span style={{ color: "#6b7280" }}>
                          {" "}
                          ({player.firstName} {player.lastName})
                        </span>
                      )}
                      :{" "}
                      <code
                        style={{
                          backgroundColor: "#fffbeb",
                          padding: "0.125rem 0.375rem",
                          borderRadius: "0.125rem",
                        }}
                      >
                        {conflict.result}
                      </code>
                      {conflict.playerRank === displayError.playerRank && (
                        <span style={{ color: "#ef4444", fontWeight: "600" }}>
                          {" ← Your result"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="correctedResult"
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: "500",
              color: "#374151",
              marginBottom: "0.5rem",
            }}
          >
            {isGameEntry
              ? "Enter corrected result string:"
              : "Enter corrected result string:"}
          </label>
          <input
            type="text"
            id="correctedResult"
            name="correctedResult"
            ref={inputRef}
            value={currentInputValue}
            onPaste={handlePaste}
            onChange={handleInputChange}
            onFocus={(e) => {
              // Select all on first open, then place cursor at end
              if (justOpened.current) {
                justOpened.current = false;
                setTimeout(() => e.target.select(), 0);
              } else {
                const len = e.target.value.length;
                e.target.setSelectionRange(len, len);
              }
            }}
            style={{
              width: "100%",
              padding: "0.5rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.25rem",
              fontSize: "0.875rem",
              marginBottom: "0.5rem",
              boxSizing: "border-box",
              borderColor: parseStatus
                ? parseStatus.isValid
                  ? "#10b981"
                  : "#ef4444"
                : "#d1d5db",
            }}
            placeholder="e.g., 5:6W7:8 for 4-player (pairs separated by colon)"
            autoFocus
          />
          <p
            style={{
              fontSize: "0.75rem",
              color: "#9ca3af",
              marginBottom: "1rem",
              userSelect: "text",
              WebkitUserSelect: "text",
              MozUserSelect: "text",
              msUserSelect: "text",
            }}
          >
            field name: correctedResult
          </p>
          {parseStatus && (
            <p
              style={{
                fontSize: "0.75rem",
                color: parseStatus.isValid ? "#10b981" : "#ef4444",
                marginBottom: "1rem",
              }}
            >
               {parseStatus.isValid
                 ? "✓ Valid format"
                 : `✗ ${parseStatus.message || getValidationErrorMessage(parseStatus.error || 0)}`}
            </p>
          )}
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              justifyContent: "flex-end",
            }}
          >
            {/* Enter-Games mode: Cancel + Enter_Recalculate_Save */}
            {isEnterGames ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "0.5rem 1rem",
                    background: "#f3f4f6",
                    border: "1px solid #d1d5db",
                    borderRadius: "0.25rem",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    color: "#374151",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEnterRecalculateSave}
                  disabled={!parseStatus?.isValid && currentInputValue.trim() !== ""}
                  style={{
                    padding: "0.5rem 1rem",
                    background: !parseStatus?.isValid && currentInputValue.trim() !== ""
                      ? "#9ca3af"
                      : "#10b981",
                    border: "none",
                    borderRadius: "0.25rem",
                    cursor: !parseStatus?.isValid && currentInputValue.trim() !== ""
                      ? "not-allowed"
                      : "pointer",
                    fontSize: "0.875rem",
                    color: "white",
                  }}
                >
                  Enter_Recalculate_Save
                </button>
              </>
            ) : (
              /* Existing modes */
              <>
                {(isWalkthrough || isRecalculate) &&
                  walkthroughIndex !== undefined &&
                  totalRounds &&
                  onWalkthroughPrev &&
                  onWalkthroughNext && (
                    <>
                      <button
                        type="button"
                        onClick={onWalkthroughPrev}
                        disabled={walkthroughIndex === 0}
                        style={{
                          padding: "0.5rem 1rem",
                          background:
                            walkthroughIndex === 0 ? "#e5e7eb" : "#f3f4f6",
                          border: "1px solid #d1d5db",
                          borderRadius: "0.25rem",
                          cursor:
                            walkthroughIndex === 0 ? "not-allowed" : "pointer",
                          fontSize: "0.875rem",
                          color: walkthroughIndex === 0 ? "#9ca3af" : "#374151",
                        }}
                      >
                        Previous (Ctrl+P)
                      </button>
                      <button
                        type="button"
                        onClick={onWalkthroughNext}
                        disabled={walkthroughIndex === totalRounds - 1}
                        style={{
                          padding: "0.5rem 1rem",
                          background:
                            walkthroughIndex === totalRounds - 1
                              ? "#e5e7eb"
                              : "#f59e0b",
                          border:
                            walkthroughIndex === totalRounds - 1
                              ? "1px solid #d1d5db"
                              : "none",
                          borderRadius: "0.25rem",
                          cursor:
                            walkthroughIndex === totalRounds - 1
                              ? "not-allowed"
                              : "pointer",
                          fontSize: "0.875rem",
                          color:
                            walkthroughIndex === totalRounds - 1
                              ? "#9ca3af"
                              : "white",
                        }}
                      >
                        Next (Ctrl+N)
                      </button>
                    </>
                  )}
                <button
                  type="button"
                  onClick={handleClearCell}
                  disabled={!currentInputValue.trim() && !existingValue}
                  style={{
                    padding: "0.5rem 1rem",
                    background: !currentInputValue.trim() && !existingValue
                      ? "#e5e7eb"
                      : "#ef4444",
                    border: "none",
                    borderRadius: "0.25rem",
                    cursor: !currentInputValue.trim() && !existingValue
                      ? "not-allowed"
                      : "pointer",
                    fontSize: "0.875rem",
                    color: !currentInputValue.trim() && !existingValue
                      ? "#9ca3af"
                      : "white",
                  }}
                >
                  Clear All Matching Cells (Ctrl+C)
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "0.5rem 1rem",
                    background: "#f3f4f6",
                    border: "1px solid #d1d5db",
                    borderRadius: "0.25rem",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    color: "#374151",
                  }}
                >
                  Cancel (Ctrl+X)
                </button>
                <button
                  type="submit"
                  disabled={!parseStatus?.isValid && currentInputValue.trim() !== ""}
                  style={{
                    padding: "0.5rem 1rem",
                    background: !parseStatus?.isValid && currentInputValue.trim() !== ""
                      ? "#9ca3af"
                      : "#3b82f6",
                    border: "none",
                    borderRadius: "0.25rem",
                    cursor: !parseStatus?.isValid && currentInputValue.trim() !== ""
                      ? "not-allowed"
                      : "pointer",
                    fontSize: "0.875rem",
                    color: "white",
                  }}
                >
                  {isGameEntry ? "Save (Ctrl+S)" : "Submit Correction (Ctrl+S)"}
                </button>
              </>
            )}
          </div>
        </form>

        {isAdmin && onAddPlayer && (
          <div
            style={{
              marginTop: "1rem",
              padding: "0.75rem",
              backgroundColor: "#eff6ff",
              borderRadius: "0.25rem",
              border: "1px solid #bfdbfe",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: "0.875rem", color: "#1e40af", fontWeight: "500" }}>
              Need to add a new player?
            </span>
            <button
              type="button"
              onClick={() => {
                onAddPlayer();
                onClose();
              }}
              style={{
                padding: "0.5rem 1rem",
                background: "#3b82f6",
                border: "none",
                borderRadius: "0.25rem",
                cursor: "pointer",
                fontSize: "0.875rem",
                color: "white",
                fontWeight: "500",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Plus size={16} />
              Add Player
            </button>
          </div>
        )}

        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem",
            backgroundColor: "#f0f9ff",
            borderRadius: "0.25rem",
            fontSize: "0.75rem",
            color: "#0369a1",
          }}
        >
          <strong>Format:</strong>
          <br />
          2-player: `2W3` (player 2 vs 3, player 2 wins)
          <br />
          2-player, 2 results: `3WL4` (player 3 vs 4, W then L)
          <br />
          4-player team game: `A:BWC:D` or `A:BWLC:D` where A&B = first team, C&D = second team
          <br />
          Example: `5:6W7:8` means:
          <br />
          - Team 1 (players 5&6) vs Team 2 (players 7&8)
          <br />
          - Team 1 wins, Team 2 loses
          <br />
          Example: `1:2LL3:4` means:
          <br />
          - Team 1&2 loses BOTH games to Team 3&4
          <br />
          - All teammates share same result(s)
        </div>
      </div>
    </div>
  );
}
