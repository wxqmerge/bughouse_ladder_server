import type { PlayerData, PrintLabelLayout } from "../../shared/types";
import type { PrintLabelsConfig } from "./PrintLabelsDialog";

interface LabelsPrintViewProps {
  players: PlayerData[];
  config: PrintLabelsConfig;
  ladderName: string;
  showRatings: boolean;
  showSchool: boolean;
}

const FIELD_CLASS_MAP: Record<string, string> = {
  ladderName: 'pl-ladder',
  group: 'pl-group',
  rating: 'pl-rating',
  rank: 'pl-rank',
  grade: 'pl-grade',
  firstName: 'pl-firstname',
  lastName: 'pl-lastname',
  schoolRoom: 'pl-school',
};

export default function LabelsPrintView({
  players,
  config,
  ladderName,
  showRatings,
  showSchool,
}: LabelsPrintViewProps) {
  const { labelsPerPage, fields, copies, layout } = config;
  const columns = labelsPerPage === 20 ? 2 : 3;
  const is30 = labelsPerPage === 30;

  const visiblePlayers = players.filter(
    (p) => p.lastName && !p.group?.endsWith("x")
  );

  const sortedPlayers = [...visiblePlayers].sort((a, b) =>
    a.firstName.localeCompare(b.firstName)
  );

  const totalLabels = config.fillBlanks ? config.fillBlanksMax : sortedPlayers.length;
  const blankCount = Math.max(0, totalLabels - sortedPlayers.length);
  const maxRank = sortedPlayers.reduce((m, p) => Math.max(m, p.rank ?? 0), 0);
  const allItems = [...sortedPlayers, ...Array.from({ length: blankCount }, (_, i) => ({ rank: maxRank + i + 1 }))];

  const pages: (PlayerData | { rank: number })[][] = [];
  for (let c = 0; c < copies; c++) {
    for (let i = 0; i < allItems.length; i += labelsPerPage) {
      pages.push(allItems.slice(i, i + labelsPerPage));
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
              const item = pagePlayers[idx];
              const colIdx = idx % columns;
              const marginTop = layout?.marginTop ?? 0;
              const marginBottom = layout?.marginBottom ?? 0;
              const colOffset = layout?.columnOffsets?.[colIdx] ?? 0;
              const cellStyle: React.CSSProperties = {};
              if (marginTop > 0) cellStyle.paddingTop = `${marginTop}%`;
              if (marginBottom > 0) cellStyle.paddingBottom = `${marginBottom}%`;
              if (!item) {
                return (
                  <div key={idx} className="print-label-cell" style={cellStyle} />
                );
              }
              const isPlayer = 'lastName' in item;
              if (!isPlayer) {
                const rankLayout = layout?.fields?.rank;
                const rankStyle: React.CSSProperties = {};
                if (rankLayout) {
                  rankStyle.left = `${rankLayout.x + colOffset}%`;
                  rankStyle.top = `${rankLayout.y}%`;
                  if (rankLayout.fontSize > 0) rankStyle.fontSize = `${rankLayout.fontSize}pt`;
                } else {
                  rankStyle.fontSize = "17pt";
                }
                rankStyle.fontFamily = "Arial, sans-serif";
                rankStyle.position = "absolute";
                return (
                  <div key={idx} className="print-label-cell" style={cellStyle}>
                    <span style={rankStyle}>{item.rank}</span>
                  </div>
                );
              }
              return (
                <div key={idx} className="print-label-cell" style={cellStyle}>
                  <FieldLabel
                    player={item}
                    ladderName={ladderName}
                    fields={fields}
                    showRatings={showRatings}
                    showSchool={showSchool}
                    layout={layout}
                    colOffset={colOffset}
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
  layout,
  colOffset,
}: {
  player: PlayerData;
  ladderName: string;
  fields: PrintLabelsConfig["fields"];
  showRatings: boolean;
  showSchool: boolean;
  layout: PrintLabelLayout | null;
  colOffset: number;
}) {
  const getLayoutStyle = (key: string): React.CSSProperties => {
    if (!layout?.fields?.[key]) return {};
    const f = layout.fields[key];
    const style: React.CSSProperties = { left: `${f.x + colOffset}%`, top: `${f.y}%` };
    if (f.fontSize > 0) style.fontSize = `${f.fontSize}pt`;
    return style;
  };

  return (
    <>
      {fields.ladderName && <span className={FIELD_CLASS_MAP.ladderName} style={getLayoutStyle('ladderName')}>{ladderName}</span>}
      {fields.group && <span className={FIELD_CLASS_MAP.group} style={getLayoutStyle('group')}>{player.group}</span>}
      {fields.rating && showRatings && <span className={FIELD_CLASS_MAP.rating} style={getLayoutStyle('rating')}>{player.rating ?? ""}</span>}
      {fields.rank && <span className={FIELD_CLASS_MAP.rank} style={getLayoutStyle('rank')}>{player.rank}</span>}
      {fields.grade && <span className={FIELD_CLASS_MAP.grade} style={getLayoutStyle('grade')}>{player.grade}</span>}
      {fields.firstName && <span className={FIELD_CLASS_MAP.firstName} style={getLayoutStyle('firstName')}>{player.firstName}</span>}
      {fields.lastName && <span className={FIELD_CLASS_MAP.lastName} style={getLayoutStyle('lastName')}>{player.lastName}</span>}
      {fields.schoolRoom && <span className={FIELD_CLASS_MAP.schoolRoom} style={getLayoutStyle('schoolRoom')}>{showSchool ? player.school : player.room}</span>}
    </>
  );
}
