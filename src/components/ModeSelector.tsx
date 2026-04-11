import { useSettings } from '../contexts/SettingsContext';
import { DataServiceMode } from '../services/dataService';

export function ModeSelector(): JSX.Element {
  const { mode, setMode, serverUrl, setServerUrl } = useSettings();

  return (
    <div style={{ padding: '10px', borderBottom: '1px solid #ccc' }}>
      <label style={{ fontWeight: 'bold', marginRight: '10px' }}>
        Data Mode:
      </label>
      
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as DataServiceMode)}
        style={{ marginRight: '15px', padding: '5px' }}
      >
        <option value={DataServiceMode.LOCAL}>Local (localStorage)</option>
        <option value={DataServiceMode.DEVELOPMENT}>Development (localhost)</option>
        <option value={DataServiceMode.SERVER}>Server</option>
      </select>

      {(mode === DataServiceMode.DEVELOPMENT || mode === DataServiceMode.SERVER) && (
        <div style={{ marginTop: '5px' }}>
          <label style={{ marginRight: '10px' }}>Server URL:</label>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder={
              mode === DataServiceMode.DEVELOPMENT
                ? 'http://localhost:3000'
                : 'https://your-server.com'
            }
            style={{ padding: '5px', minWidth: '250px' }}
          />
        </div>
      )}

      <div style={{ marginTop: '5px', fontSize: '12px', color: '#666' }}>
        Current: {mode} {serverUrl && `(${serverUrl})`}
      </div>
    </div>
  );
}
