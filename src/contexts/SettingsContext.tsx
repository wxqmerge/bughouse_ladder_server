import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { dataService, DataServiceMode, DataServiceConfig } from '../services/dataService';

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
    const saved = localStorage.getItem('ladder_settings_mode');
    return (saved as DataServiceMode) || DataServiceMode.LOCAL;
  });

  const [serverUrl, setServerUrl] = useState<string>(() => {
    return localStorage.getItem('ladder_server_url') || '';
  });

  const [authToken, setAuthToken] = useState<string | null>(() => {
    return localStorage.getItem('ladder_auth_token');
  });

  useEffect(() => {
    localStorage.setItem('ladder_settings_mode', mode);
    dataService.updateConfig({ mode, serverUrl: serverUrl || undefined });
  }, [mode, serverUrl]);

  useEffect(() => {
    if (authToken) {
      localStorage.setItem('ladder_auth_token', authToken);
    } else {
      localStorage.removeItem('ladder_auth_token');
    }
    dataService.updateConfig({ authToken: authToken || undefined });
  }, [authToken]);

  const handleSetMode = (newMode: DataServiceMode): void => {
    setMode(newMode);
  };

  const handleSetServerUrl = (url: string): void => {
    setServerUrl(url);
    localStorage.setItem('ladder_server_url', url);
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
