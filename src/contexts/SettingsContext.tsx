import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { dataService, DataServiceMode, DataServiceConfig } from '../services/dataService';
import { setJson, getJson, removeJson } from '../services/storageService';

interface SettingsContextType {
  mode: DataServiceMode;
  serverUrl: string;
  setMode: (mode: DataServiceMode) => void;
  setServerUrl: (url: string) => void;
  authToken: string | null;
  setAuthToken: (token: string | null) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [mode, setMode] = useState<DataServiceMode>(() => {
    const saved = getJson<DataServiceMode>('settings_mode');
    return saved || DataServiceMode.LOCAL;
  });

  const [serverUrl, setServerUrl] = useState<string>(() => {
    return getJson<string>('server_url') || '';
  });

  const [authToken, setAuthToken] = useState<string | null>(() => {
    return getJson<string>('auth_token');
  });

  useEffect(() => {
    setJson('settings_mode', mode);
    dataService.updateConfig({ mode, serverUrl: serverUrl || undefined });
  }, [mode, serverUrl]);

  useEffect(() => {
    if (authToken) {
      setJson('auth_token', authToken);
    } else {
      removeJson('auth_token');
    }
    // No longer used - auth removed
  }, [authToken]);

  const handleSetMode = (newMode: DataServiceMode): void => {
    setMode(newMode);
  };

  const handleSetServerUrl = (url: string): void => {
    setServerUrl(url);
    setJson('server_url', url);
  };

  const handleSetAuthToken = (token: string | null): void => {
    setAuthToken(token);
  };

  return (
    <SettingsContext.Provider
      value={{
        mode,
        serverUrl,
        setMode: handleSetMode,
        setServerUrl: handleSetServerUrl,
        authToken,
        setAuthToken: handleSetAuthToken,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
