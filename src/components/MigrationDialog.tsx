import { useState, useEffect } from 'react';
import { PlayerData } from '../../shared/types';
import { 
  detectRankNameMismatches,
  applyMigration,
  MigrationNonResultStrategy,
  MigrationResultsStrategy,
} from '../utils/migrationUtils';

interface MigrationDialogProps {
  isAdmin: boolean;
  onClose: () => void;
}

export function MigrationDialog({ isAdmin, onClose }: MigrationDialogProps) {
  const [localPlayers, setLocalPlayers] = useState<PlayerData[]>([]);
  const [serverPlayers, setServerPlayers] = useState<PlayerData[]>([]);
  const [hasMismatch, setHasMismatch] = useState(false);
  const [mismatchedRanks, setMismatchedRanks] = useState<number[]>([]);
  
  // Custom merge options
  const [nonResultStrategy, setNonResultStrategy] = useState<MigrationNonResultStrategy>('use-server');
  const [resultsStrategy, setResultsStrategy] = useState<MigrationResultsStrategy>('merge');
  const [selectedOption, setSelectedOption] = useState<'simple' | 'custom'>('simple');

  useEffect(() => {
    const localData = localStorage.getItem('ladder_ladder_players');
    const serverData = localStorage.getItem('ladder_server_ladder_players');
    
    const local = localData ? JSON.parse(localData) : [];
    const server = serverData ? JSON.parse(serverData) : [];
    
    setLocalPlayers(local);
    setServerPlayers(server);
    
    const mismatchInfo = detectRankNameMismatches(local, server);
    setHasMismatch(mismatchInfo.hasMismatch);
    setMismatchedRanks(mismatchInfo.mismatchedRanks);
  }, []);

  const handleUseServer = () => {
    applyMigration('use-server');
    onClose();
  };

  const handleUseLocal = () => {
    applyMigration('use-local');
    onClose();
  };

  const handleCustomMerge = () => {
    applyMigration('custom', { nonResultStrategy, resultsStrategy });
    onClose();
  };

  const handleAbort = () => {
    // Stay in local mode, clear the migration prompt
    sessionStorage.removeItem('ladder_last_mode');
    onClose();
  };

  if (hasMismatch && !isAdmin) {
    // Restricted options for non-admins with mismatches
    return (
      <div className="migration-dialog-overlay">
        <div className="migration-dialog">
          <div className="migration-dialog-header">
            <h2>⚠️ Data Mismatch Detected</h2>
          </div>
          <div className="migration-dialog-body">
            <p>Rank/name mismatches found at ranks: <strong>{mismatchedRanks.join(', ')}</strong></p>
            <p>This means the same rank has different players in local vs server data.</p>
            <p>Please contact your administrator to resolve this conflict, or choose one of the following options:</p>
            
            <div className="migration-options">
              <div className="migration-option">
                <button onClick={handleUseServer} className="btn btn-primary">
                  Use Server Data
                </button>
                <p className="option-description">Discard all local data and use server data only</p>
              </div>
              
              <div className="migration-option">
                <button onClick={handleAbort} className="btn btn-secondary">
                  Abort (Stay Local)
                </button>
                <p className="option-description">Keep local data and remain in local mode</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="migration-dialog-overlay">
      <div className="migration-dialog">
        <div className="migration-dialog-header">
          <h2>🔄 Mode Change Detected</h2>
        </div>
        <div className="migration-dialog-body">
          <p>You were using <strong>Local mode</strong>, but <strong>Server mode</strong> is now configured.</p>
          
          <div className="data-summary">
            <div className="summary-item">
              <span className="summary-label">Local data:</span>
              <span className="summary-value">{localPlayers.length} players</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Server data:</span>
              <span className="summary-value">{serverPlayers.length} players</span>
            </div>
          </div>

          {hasMismatch && isAdmin && (
            <div className="mismatch-warning">
              <p>⚠️ Rank/name mismatches detected at ranks: <strong>{mismatchedRanks.join(', ')}</strong></p>
              <p>Merge operations may produce unexpected results.</p>
            </div>
          )}

          <hr />
          
          <h3>Migration Options</h3>
          
          <div className="migration-options">
            <div className="migration-option">
              <button onClick={handleUseServer} className="btn btn-primary">
                Use Server Data
              </button>
              <p className="option-description">Discard all local data and use server data only</p>
            </div>
            
            <div className="migration-option">
              <button onClick={handleUseLocal} className="btn btn-secondary">
                Keep Local Data
              </button>
              <p className="option-description">Discard server data and keep local data only</p>
            </div>
          </div>

          <hr />

          <h3>Advanced: Merge Data</h3>
          <p className="merge-help">Combine data from both sources. Choose how to handle conflicts:</p>
          
          <div className="merge-section">
            <h4>Non-Result Fields (name, rating, etc.)</h4>
            <div className="radio-group">
              <label className="radio-label">
                <input 
                  type="radio" 
                  name="nonresult" 
                  checked={nonResultStrategy === 'use-server'}
                  onChange={() => setNonResultStrategy('use-server')}
                />
                <span>Use Server Values</span>
                <span className="radio-help">Server data takes priority for player info</span>
              </label>
              <label className="radio-label">
                <input 
                  type="radio" 
                  name="nonresult" 
                  checked={nonResultStrategy === 'use-local'}
                  onChange={() => setNonResultStrategy('use-local')}
                />
                <span>Use Local Values</span>
                <span className="radio-help">Local data takes priority for player info</span>
              </label>
            </div>
          </div>

          <div className="merge-section">
            <h4>Game Results</h4>
            <div className="radio-group">
              <label className="radio-label">
                <input 
                  type="radio" 
                  name="results" 
                  checked={resultsStrategy === 'merge'}
                  onChange={() => setResultsStrategy('merge')}
                />
                <span>Merge Results</span>
                <span className="radio-help">Combine results from both sources (server wins conflicts)</span>
              </label>
              <label className="radio-label">
                <input 
                  type="radio" 
                  name="results" 
                  checked={resultsStrategy === 'dont-merge'}
                  onChange={() => setResultsStrategy('dont-merge')}
                />
                <span>Use Server Results Only</span>
                <span className="radio-help">Discard local game results</span>
              </label>
            </div>
          </div>

          <div className="migration-option">
            <button onClick={handleCustomMerge} className="btn btn-primary">
              Apply Merge
            </button>
            <p className="option-description">
              Non-results: {nonResultStrategy === 'use-server' ? 'Server' : 'Local'} priority | 
              Results: {resultsStrategy === 'merge' ? 'Merged' : 'Server only'}
            </p>
          </div>

          <hr />
          
          <div className="migration-dialog-actions">
            <button onClick={handleAbort} className="btn btn-secondary">
              Cancel Migration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
