import { useState, useEffect } from "react";
import { Printer, X, Check, LayoutTemplate } from "lucide-react";
import type { PrintLabelLayout } from "../../shared/types";
import PrintLabelLayoutEditor from "./PrintLabelLayoutEditor";
import { loadLayouts } from "../utils/printLabelLayouts";

interface PrintLabelsDialogProps {
  onClose: () => void;
  onPrint: (config: PrintLabelsConfig) => void;
  playerCount: number;
  defaultLabelsPerPage?: 20 | 30;
  isMiniGame?: boolean;
}

export interface PrintLabelsConfig {
  labelsPerPage: 20 | 30;
  copies: number;
  fields: {
    ladderName: boolean;
    group: boolean;
    rating: boolean;
    rank: boolean;
    grade: boolean;
    firstName: boolean;
    lastName: boolean;
    schoolRoom: boolean;
  };
  layout: PrintLabelLayout | null;
  fillBlanks: boolean;
  fillBlanksMax: number;
}

const ALL_FIELDS = [
  { key: "ladderName" as const, label: "Ladder Name", std: true, mg: true },
  { key: "group" as const, label: "Group", std: true, mg: false },
  { key: "rating" as const, label: "Rating", std: true, mg: false },
  { key: "rank" as const, label: "Rank", std: true, mg: true },
  { key: "grade" as const, label: "Grade", std: true, mg: true },
  { key: "firstName" as const, label: "First Name", std: true, mg: true },
  { key: "lastName" as const, label: "Last Name", std: true, mg: true },
  { key: "schoolRoom" as const, label: "School/Room", std: true, mg: false },
];

function defaultFields(isMiniGame: boolean): PrintLabelsConfig["fields"] {
  return Object.fromEntries(
    ALL_FIELDS.map((f) => [f.key, isMiniGame ? f.mg : f.std])
  ) as PrintLabelsConfig["fields"];
}

export default function PrintLabelsDialog({
  onClose,
  onPrint,
  playerCount,
  defaultLabelsPerPage = 20,
  isMiniGame = false,
}: PrintLabelsDialogProps) {
  const [labelsPerPage, setLabelsPerPage] = useState<20 | 30>(defaultLabelsPerPage);
  const [fields, setFields] = useState(() => defaultFields(isMiniGame));
  const [copies, setCopies] = useState(1);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);
  const [selectedLayout, setSelectedLayout] = useState<PrintLabelLayout | null>(() => {
    const saved = loadLayouts();
    const match = saved.find(l => l.labelsPerPage === defaultLabelsPerPage);
    return match || null;
  });
  const [fillBlanks, setFillBlanks] = useState(false);
  const [fillBlanksMax, setFillBlanksMax] = useState(Math.min(Math.ceil(playerCount / defaultLabelsPerPage) * defaultLabelsPerPage, 200));

  useEffect(() => {
    setFillBlanksMax((prev) => Math.max(prev, Math.min(Math.ceil(playerCount / labelsPerPage) * labelsPerPage, 200)));
  }, [labelsPerPage, playerCount]);

  // Update selectedLayout when labelsPerPage changes
  useEffect(() => {
    const saved = loadLayouts();
    const match = saved.find(l => l.labelsPerPage === labelsPerPage);
    if (match && (!selectedLayout || selectedLayout.labelsPerPage !== labelsPerPage)) {
      setSelectedLayout(match);
    }
  }, [labelsPerPage]);

  const pagesNeeded = Math.ceil(playerCount / labelsPerPage);

  const toggleField = (key: keyof typeof fields) => {
    setFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePrint = () => {
    onPrint({ labelsPerPage, fields, copies, layout: selectedLayout, fillBlanks, fillBlanksMax });
    onClose();
  };

  const checkboxStyle = (checked: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 10px",
    borderRadius: "6px",
    border: checked ? "1.5px solid #2563eb" : "1px solid #d1d5db",
    backgroundColor: checked ? "#eff6ff" : "white",
    cursor: "pointer",
    fontSize: "14px",
    color: checked ? "#2563eb" : "#374151",
    userSelect: "none" as const,
  });

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10001,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          maxWidth: "420px",
          width: "100%",
          boxShadow: "0 10px 40px rgba(0, 0, 0, 0.3)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "18px", color: "#1e293b" }}>
            Print Labels
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              color: "#64748b",
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: "24px" }}>
          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                color: "#374151",
                marginBottom: "8px",
              }}
            >
              Labels Per Page
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              {[
                { value: 20, label: "20/page (2\u00D710)" },
                { value: 30, label: "30/page (3\u00D710)" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setLabelsPerPage(opt.value as 20 | 30)}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: "6px",
                    border:
                      labelsPerPage === opt.value
                        ? "2px solid #2563eb"
                        : "1px solid #d1d5db",
                    backgroundColor:
                      labelsPerPage === opt.value ? "#eff6ff" : "white",
                    color: labelsPerPage === opt.value ? "#2563eb" : "#374151",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                color: "#374151",
                marginBottom: "8px",
              }}
            >
              Fields
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "6px",
              }}
            >
              {ALL_FIELDS.map((f) => (
                <div
                  key={f.key}
                  onClick={() => toggleField(f.key)}
                  style={checkboxStyle(fields[f.key])}
                >
                  {fields[f.key] ? (
                    <Check size={14} strokeWidth={3} />
                  ) : (
                    <div
                      style={{
                        width: "14px",
                        height: "14px",
                        borderRadius: "3px",
                        border: "1.5px solid #cbd5e1",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  {f.label}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                color: "#374151",
                marginBottom: "8px",
              }}
            >
              Copies
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                onClick={() => setCopies(Math.max(1, copies - 1))}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                  backgroundColor: "white",
                  cursor: "pointer",
                  fontSize: "18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={20}
                value={copies}
                onChange={(e) =>
                  setCopies(
                    Math.max(1, Math.min(20, parseInt(e.target.value) || 1))
                  )
                }
                style={{
                  width: "60px",
                  textAlign: "center",
                  padding: "8px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                  fontSize: "16px",
                }}
              />
              <button
                onClick={() => setCopies(Math.min(20, copies + 1))}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                  backgroundColor: "white",
                  cursor: "pointer",
                  fontSize: "18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                +
              </button>
            </div>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                fontSize: "14px",
                color: fillBlanks ? "#2563eb" : "#374151",
                userSelect: "none" as const,
              }}
              onClick={() => setFillBlanks(!fillBlanks)}
            >
              {fillBlanks ? (
                <Check size={16} strokeWidth={3} />
              ) : (
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "4px",
                    border: "1.5px solid #cbd5e1",
                    flexShrink: 0,
                  }}
                />
              )}
              Fill with blanks up to
            </label>
            {fillBlanks && (
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "10px", marginLeft: "24px" }}>
                <button
                  onClick={() => setFillBlanksMax(Math.max(playerCount, Math.min(200, fillBlanksMax - 10)))}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    backgroundColor: "white",
                    cursor: "pointer",
                    fontSize: "18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  -
                </button>
                <input
                  type="number"
                  min={playerCount}
                  max={200}
                  step={10}
                  value={fillBlanksMax}
                  onChange={(e) =>
                    setFillBlanksMax(
                      Math.max(playerCount, Math.min(200, parseInt(e.target.value) || playerCount))
                    )
                  }
                  style={{
                    width: "80px",
                    textAlign: "center",
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    fontSize: "16px",
                  }}
                />
                <button
                  onClick={() => setFillBlanksMax(Math.min(200, fillBlanksMax + 10))}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    backgroundColor: "white",
                    cursor: "pointer",
                    fontSize: "18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  +
                </button>
                <span style={{ fontSize: "13px", color: "#64748b" }}>
                  ({fillBlanksMax - playerCount} blanks)
                </span>
              </div>
            )}
          </div>

          <div
            style={{
              padding: "12px",
              backgroundColor: "#f8fafc",
              borderRadius: "6px",
              fontSize: "13px",
              color: "#64748b",
            }}
          >
            {playerCount} player{playerCount !== 1 ? "s" : ""}{fillBlanks ? ` + ${fillBlanksMax - playerCount} blanks` : ""} \u2192{" "}
            {Math.ceil((fillBlanks ? fillBlanksMax : playerCount) / labelsPerPage)} page{Math.ceil((fillBlanks ? fillBlanksMax : playerCount) / labelsPerPage) !== 1 ? "s" : ""}
            {copies > 1
              ? ` \u00D7 ${copies} copies = ${(Math.ceil((fillBlanks ? fillBlanksMax : playerCount) / labelsPerPage) * copies).toLocaleString()} pages`
              : ""}
          </div>
        </div>

        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "10px 20px",
              borderRadius: "6px",
              border: "1px solid #d1d5db",
              backgroundColor: "white",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 500,
              color: "#374151",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => setShowLayoutEditor(true)}
            style={{
              padding: "10px 20px",
              borderRadius: "6px",
              border: "1px solid #d1d5db",
              backgroundColor: "white",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 500,
              color: "#374151",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <LayoutTemplate size={16} />
            Layout Editor
          </button>
          <button
            onClick={handlePrint}
            style={{
              padding: "10px 20px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: "#2563eb",
              color: "white",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Printer size={16} />
            Preview & Print
          </button>
        </div>
      </div>
      {showLayoutEditor && (
        <PrintLabelLayoutEditor
          onClose={() => setShowLayoutEditor(false)}
          onSave={setSelectedLayout}
          currentLayout={selectedLayout}
          labelsPerPage={labelsPerPage}
        />
      )}
    </div>
  );
}
