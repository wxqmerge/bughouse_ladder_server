import type { PlayerData } from "../../shared/types";
import type { PrintLabelsConfig } from "./PrintLabelsDialog";

interface LabelsPrintViewProps {
  players: PlayerData[];
  config: PrintLabelsConfig;
  ladderName: string;
  showRatings: boolean;
  showSchool: boolean;
}

export default function LabelsPrintView({
  players,
  config,
  ladderName,
  showRatings,
  showSchool,
}: LabelsPrintViewProps) {
  const { labelsPerPage, fields, copies } = config;
  const columns = labelsPerPage === 20 ? 2 : 3;
  const is30 = labelsPerPage === 30;

  const visiblePlayers = players.filter(
    (p) => p.lastName && !p.group?.endsWith("x")
  );

  const sortedPlayers = [...visiblePlayers].sort((a, b) =>
    a.firstName.localeCompare(b.firstName)
  );

  const pages: PlayerData[][] = [];
  for (let c = 0; c < copies; c++) {
    for (let i = 0; i < sortedPlayers.length; i += labelsPerPage) {
      pages.push(sortedPlayers.slice(i, i + labelsPerPage));
    }
  }

  const gridClass = `print-labels-grid${is30 ? " labels-30" : ""}`;

  return (
    <div className="print-labels-wrapper">
      {pages.map((pagePlayers, pageIdx) => (
        <div key={pageIdx} className="print-labels-page">
          <div
            className={gridClass}
            style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
          >
            {Array.from({ length: labelsPerPage }).map((_, idx) => {
              const player = pagePlayers[idx];
              if (!player) {
                return <div key={idx} className="print-label-cell" />;
              }
              return (
                <div key={idx} className="print-label-cell">
                  <FieldLabel
                    player={player}
                    ladderName={ladderName}
                    fields={fields}
                    showRatings={showRatings}
                    showSchool={showSchool}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function FieldLabel({
  player,
  ladderName,
  fields,
  showRatings,
  showSchool,
}: {
  player: PlayerData;
  ladderName: string;
  fields: PrintLabelsConfig["fields"];
  showRatings: boolean;
  showSchool: boolean;
}) {
  return (
    <>
      {fields.ladderName && <span className="pl-ladder">{ladderName}</span>}
      {fields.group && <span className="pl-group">{player.group}</span>}
      {fields.rating && showRatings && <span className="pl-rating">{player.rating ?? ""}</span>}
      {fields.rank && <span className="pl-rank">{player.rank}</span>}
      {fields.grade && <span className="pl-grade">{player.grade}</span>}
      {fields.firstName && <span className="pl-firstname">{player.firstName}</span>}
      {fields.lastName && <span className="pl-lastname">{player.lastName}</span>}
      {fields.schoolRoom && <span className="pl-school">{showSchool ? player.school : player.room}</span>}
    </>
  );
}
