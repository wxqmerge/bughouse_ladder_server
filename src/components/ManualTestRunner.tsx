import { useState, useEffect } from 'react';
import { PlayerData } from '../../shared/types';

interface TestCase {
  name: string;
  inputFilePath: string;
  expectedOutputFile?: string;
  actions: TestAction[];
  clickMenu?: string;
  selectMenuItem?: string;
}

interface TestAction {
  type: 'clickMenu' | 'selectMenuItem' | 'pasteResults' | 'enterData';
  menu?: string;
  item?: string;
  data?: string;
  field?: string;
}

export function ManualTestRunner() {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [selectedTest, setSelectedTest] = useState<string>('');
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [testStatus, setTestStatus] = useState<'idle' | 'running' | 'complete'>('idle');
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    // Load test case files from test-cases directory
    loadTestCases();
  }, []);

  const loadTestCases = async () => {
    // This would normally fetch from the test-cases directory
    // For now, we'll provide a manual interface
    log('Ready to run manual tests');
  };

  const log = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const startTest = async (testName: string) => {
    setSelectedTest(testName);
    setCurrentStep(0);
    setTestStatus('running');
    setLogs([]);
    log(`Starting test: ${testName}`);
    
    // Clear existing data
    await clearTestData();
  };

  const clearTestData = async () => {
    // Clear localStorage test data
    localStorage.removeItem('ladder_ladder_players');
    localStorage.removeItem('ladder_server_ladder_players');
    log('Cleared existing test data');
  };

  const loadInputFile = async (fileName: string) => {
    try {
      const response = await fetch(`/test-cases/${fileName}`);
      if (!response.ok) throw new Error(`Failed to load ${fileName}`);
      const text = await response.text();
      log(`Loaded ${fileName}: ${text.length} bytes`);
      return text;
    } catch (error) {
      log(`ERROR loading ${fileName}: ${error}`);
      return null;
    }
  };

  const parseTabFile = (content: string): PlayerData[] => {
    const lines = content.trim().split('\n');
    const players: PlayerData[] = [];
    
    for (let i = 1; i < lines.length; i++) { // Skip header
      const cols = lines[i].split('\t');
      if (cols.length >= 13) {
        players.push({
          rank: parseInt(cols[0]),
          group: cols[1],
          lastName: cols[2],
          firstName: cols[3],
          rating: parseInt(cols[4]),
          nRating: parseInt(cols[5]),
          grade: cols[6],
          num_games: parseInt(cols[7]),
          attendance: cols[8],
          info: cols[9],
          phone: cols[10],
          school: cols[11],
          room: cols[12],
          gameResults: new Array(31).fill(null),
        });
      }
    }
    return players;
  };

  const exportCurrentData = async () => {
    // Get current players from localStorage
    const data = localStorage.getItem('ladder_ladder_players');
    if (!data) {
      log('No player data to export');
      return;
    }
    
    const players: PlayerData[] = JSON.parse(data);
    const tabContent = convertToTabFormat(players);
    
    // Download as file
    const blob = new Blob([tabContent], { type: 'text/tab-separated-values' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export_${Date.now()}.tab`;
    a.click();
    URL.revokeObjectURL(url);
    
    log('Exported current data to .tab file');
  };

  const convertToTabFormat = (players: PlayerData[]): string => {
    const header = 'Rank\tGroup\tLast Name\tFirst Name\tRating\tN Rating\tGrade\tNum Games\tAttendance\tInfo\tPhone\tSchool\tRoom';
    const lines = [header];
    
    for (const player of players) {
      const line = [
        player.rank,
        player.group,
        player.lastName,
        player.firstName,
        player.rating,
        player.nRating,
        player.grade,
        player.num_games,
        player.attendance,
        player.info,
        player.phone,
        player.school,
        player.room
      ].join('\t');
      lines.push(line);
    }
    
    return lines.join('\n');
  };

  return (
    <div className="test-runner">
      <div className="test-runner-header">
        <h2>🧪 Manual Test Runner</h2>
        <p>Select a test case to run manually</p>
      </div>

      <div className="test-runner-content">
        <div className="test-list">
          <h3>Available Tests</h3>
          <div className="test-item" onClick={() => startTest('01-kings-cross')}>
            <span className="test-name">01 - Kings Cross</span>
            <span className="test-desc">Basic file I/O and recalculate</span>
          </div>
          <div className="test-item" onClick={() => startTest('02-basic-file-io')}>
            <span className="test-name">02 - Basic File I/O</span>
            <span className="test-desc">File import/export operations</span>
          </div>
          <div className="test-item" onClick={() => startTest('03-recalculate-ratings')}>
            <span className="test-name">03 - Recalculate Ratings</span>
            <span className="test-desc">Rating recalculation logic</span>
          </div>
          <div className="test-item" onClick={() => startTest('04-paste-results')}>
            <span className="test-name">04 - Paste Results</span>
            <span className="test-desc">Paste game results feature</span>
          </div>
        </div>

        <div className="test-controls">
          {selectedTest ? (
            <div>
              <h3>Running: {selectedTest}</h3>
              
              <div className="control-group">
                <button onClick={() => loadInputFile(`${selectedTest}.tab`) || log('Load input file clicked')}>
                  1. Load Input File
                </button>
                <span className="hint">Loads .tab file into memory</span>
              </div>

              <div className="control-group">
                <button onClick={() => log('Import data - manual step')}>
                  2. Import Data
                </button>
                <span className="hint">Go to main app, paste results</span>
              </div>

              <div className="control-group">
                <button onClick={() => log('Execute actions - manual steps')}>
                  3. Execute Actions
                </button>
                <span className="hint">Follow test case steps in main app</span>
              </div>

              <div className="control-group">
                <button onClick={exportCurrentData}>
                  4. Export Results
                </button>
                <span className="hint">Downloads current data as .tab file</span>
              </div>

              <div className="control-group">
                <button onClick={() => {
                  setTestStatus('idle');
                  setSelectedTest('');
                }}>
                  Stop Test
                </button>
              </div>
            </div>
          ) : (
            <p>Select a test from the list to begin</p>
          )}
        </div>

        <div className="test-logs">
          <h3>Logs</h3>
          <div className="log-content">
            {logs.map((log, i) => (
              <div key={i} className="log-entry">{log}</div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .test-runner {
          padding: 20px;
          font-family: system-ui, -apple-system, sans-serif;
        }
        
        .test-runner-header {
          margin-bottom: 20px;
        }
        
        .test-runner-header h2 {
          margin: 0 0 8px 0;
        }
        
        .test-runner-content {
          display: grid;
          grid-template-columns: 250px 1fr;
          gap: 20px;
        }
        
        .test-list {
          border-right: 1px solid #cbd5e1;
          padding-right: 20px;
        }
        
        .test-list h3 {
          margin: 0 0 12px 0;
          font-size: 14px;
          text-transform: uppercase;
          color: #64748b;
        }
        
        .test-item {
          padding: 12px;
          margin-bottom: 8px;
          background-color: #f8fafc;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .test-item:hover {
          background-color: #e2e8f0;
        }
        
        .test-name {
          display: block;
          font-weight: 600;
          margin-bottom: 4px;
        }
        
        .test-desc {
          display: block;
          font-size: 12px;
          color: #64748b;
        }
        
        .test-controls {
          padding: 20px;
          background-color: #f8fafc;
          border-radius: 8px;
        }
        
        .test-controls h3 {
          margin: 0 0 16px 0;
        }
        
        .control-group {
          margin-bottom: 16px;
        }
        
        .control-group button {
          padding: 10px 16px;
          background-color: #2563eb;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
        }
        
        .control-group button:hover {
          background-color: #1e40af;
        }
        
        .hint {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          color: #64748b;
        }
        
        .test-logs {
          grid-column: 1 / -1;
          margin-top: 20px;
        }
        
        .test-logs h3 {
          margin: 0 0 12px 0;
          font-size: 14px;
          text-transform: uppercase;
          color: #64748b;
        }
        
        .log-content {
          background-color: #1e293b;
          color: #e2e8f0;
          padding: 16px;
          border-radius: 6px;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 13px;
          max-height: 200px;
          overflow-y: auto;
        }
        
        .log-entry {
          margin-bottom: 4px;
        }
      `}</style>
    </div>
  );
}
