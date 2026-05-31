import { useState, useEffect } from "react";
import { X, UserPlus } from "lucide-react";
import type { PlayerData } from "../../shared/types";
import { debugInput } from "../utils/debug";

interface AddPlayerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (player: Omit<PlayerData, "rank" | "nRating" | "gameResults">, rank?: number) => void;
  currentPlayerCount?: number;
  suggestedRank?: number;
}

export default function AddPlayerDialog({
  isOpen,
  onClose,
  onAdd,
  currentPlayerCount,
  suggestedRank,
}: AddPlayerDialogProps) {
  const [group, setGroup] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [rating, setRating] = useState("");
  const [grade, setGrade] = useState("");
  const [phone, setPhone] = useState("");
  const [info, setInfo] = useState("");
  const [school, setSchool] = useState("");
  const [room, setRoom] = useState("");
  const [customRank, setCustomRank] = useState<number | undefined>(undefined);
  const [trophyEligible, setTrophyEligible] = useState(true);

  // Calculate next available rank
  const nextRank = customRank !== undefined
    ? customRank
    : (suggestedRank !== undefined
      ? suggestedRank
      : (currentPlayerCount !== undefined ? currentPlayerCount + 1 : 1));

  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setGroup("");
    setLastName("");
    setFirstName("");
    setRating("");
    setGrade("");
    setPhone("");
    setInfo("");
    setSchool("");
    setRoom("");
    setCustomRank(undefined);
    setTrophyEligible(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
     console.log(`>>> [BUTTON PRESSED] Add Player [submit] - Rank: ${nextRank}, Name: ${firstName} ${lastName}`);
     e.preventDefault();

    if (!lastName || !firstName) {
      alert("Last Name and First Name are required");
      return;
    }

    const newPlayer = {
      group,
      lastName,
      firstName,
      rating: rating ? parseInt(rating) : 0,
      trophyEligible,
      grade,
      phone,
      info,
      school,
      room,
      num_games: 0,
      attendance: nextRank,
    };

    onAdd(newPlayer, nextRank);
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

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
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "0.5rem",
          padding: "1.5rem",
          maxWidth: "500px",
          width: "90%",
          maxHeight: "80vh",
          overflow: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.5rem",
          }}
        >
          <h2
            style={{
              fontSize: "1.25rem",
              fontWeight: "600",
              color: "#3b82f6",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <UserPlus size={24} />
            {suggestedRank !== undefined ? `Add Player (Rank ${suggestedRank})` : 'Add New Player'}
          </h2>
      <button
             onClick={() => { console.log(">>> [BUTTON PRESSED] X Close [AddPlayerDialog]"); onClose(); }}
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

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}
          >
            <div>
              <label
                htmlFor="rank"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                {suggestedRank !== undefined ? 'Rank' : 'Rank (Auto-assigned)'}
              </label>
              <input
                type="number"
                id="rank"
                value={nextRank.toString()}
                readOnly={!suggestedRank}
                onChange={(e) => { debugInput("AddPlayer:Rank", e.target.value); setCustomRank(parseInt(e.target.value) || undefined); }}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.25rem",
                  fontSize: "0.875rem",
                  boxSizing: "border-box",
                  backgroundColor: suggestedRank ? "#ffffff" : "#f3f4f6",
                  cursor: suggestedRank ? "text" : "not-allowed",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                Trophy
              </label>
              <button
                type="button"
                onClick={() => { console.log(`>>> [BUTTON PRESSED] Trophy Toggle [AddPlayerDialog] -> ${!trophyEligible ? '+' : '-'}`); setTrophyEligible(!trophyEligible); }}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.25rem",
                  fontSize: "1.25rem",
                  fontWeight: "700",
                  fontFamily: "monospace",
                  cursor: "pointer",
                  boxSizing: "border-box",
                  backgroundColor: trophyEligible !== false ? "#dcfce7" : "#fee2e2",
                  color: trophyEligible !== false ? "#16a34a" : "#dc2626",
                }}
              >
                {trophyEligible !== false ? "+" : "-"}
              </button>
            </div>

            <div>
              <label
                htmlFor="group"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                Group
              </label>
              <input
                type="text"
                id="group"
                value={group}
                onChange={(e) => { debugInput("AddPlayer:Group", e.target.value); setGroup(e.target.value); }}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.25rem",
                  fontSize: "0.875rem",
                  boxSizing: "border-box",
                }}
                placeholder="e.g., A1, B"
              />
            </div>

            <div>
              <label
                htmlFor="lastName"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                Last Name *
              </label>
              <input
                type="text"
                id="lastName"
                value={lastName}
                onChange={(e) => { debugInput("AddPlayer:Last Name", e.target.value); setLastName(e.target.value); }}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.25rem",
                  fontSize: "0.875rem",
                  boxSizing: "border-box",
                }}
                required
              />
            </div>

            <div>
              <label
                htmlFor="firstName"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                First Name *
              </label>
              <input
                type="text"
                id="firstName"
                value={firstName}
                onChange={(e) => { debugInput("AddPlayer:First Name", e.target.value); setFirstName(e.target.value); }}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.25rem",
                  fontSize: "0.875rem",
                  boxSizing: "border-box",
                }}
                required
              />
            </div>

            <div>
              <label
                htmlFor="rating"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                Rating
              </label>
              <input
                type="number"
                id="rating"
                value={rating}
                onChange={(e) => { debugInput("AddPlayer:Rating", e.target.value); setRating(e.target.value); }}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.25rem",
                  fontSize: "0.875rem",
                  boxSizing: "border-box",
                }}
                placeholder="e.g., 1000"
              />
            </div>

            <div>
              <label
                htmlFor="grade"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                Grade
              </label>
              <input
                type="text"
                id="grade"
                value={grade}
                onChange={(e) => { debugInput("AddPlayer:Grade", e.target.value); setGrade(e.target.value); }}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.25rem",
                  fontSize: "0.875rem",
                  boxSizing: "border-box",
                }}
                placeholder="e.g., 8th"
              />
            </div>

            <div>
              <label
                htmlFor="phone"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                Phone
              </label>
              <input
                type="text"
                id="phone"
                value={phone}
                onChange={(e) => { debugInput("AddPlayer:Phone", e.target.value); setPhone(e.target.value); }}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.25rem",
                  fontSize: "0.875rem",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label
                htmlFor="school"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                School
              </label>
              <input
                type="text"
                id="school"
                value={school}
                onChange={(e) => { debugInput("AddPlayer:School", e.target.value); setSchool(e.target.value); }}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.25rem",
                  fontSize: "0.875rem",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label
                htmlFor="room"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                Room
              </label>
              <input
                type="text"
                id="room"
                value={room}
                onChange={(e) => { debugInput("AddPlayer:Room", e.target.value); setRoom(e.target.value); }}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.25rem",
                  fontSize: "0.875rem",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label
                htmlFor="info"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                Info
              </label>
              <input
                type="text"
                id="info"
                value={info}
                onChange={(e) => { debugInput("AddPlayer:Info", e.target.value); setInfo(e.target.value); }}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.25rem",
                  fontSize: "0.875rem",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              justifyContent: "flex-end",
              marginTop: "1.5rem",
            }}
          >
    <button
               type="button"
               onClick={() => { console.log(">>> [BUTTON PRESSED] Cancel [AddPlayerDialog]"); onClose(); }}
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
              type="submit"
              style={{
                padding: "0.5rem 1rem",
                background: "#3b82f6",
                border: "none",
                borderRadius: "0.25rem",
                cursor: "pointer",
                fontSize: "0.875rem",
                color: "white",
              }}
            >
              Add Player
            </button>
          </div>
        </form>

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
          <strong>Note:</strong> Rank will be auto-assigned if not provided. New
          player starts with 0 games and attendance based on rank (or next
          available).
        </div>
      </div>
    </div>
  );
}
