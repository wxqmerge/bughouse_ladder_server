import { Clock, Database, Server, Loader2 } from "lucide-react";

interface StatusBannerProps {
  status: string | null;
}

export function StatusBanner({ status }: StatusBannerProps) {
  if (!status) return null;

  return (
    <div style={{
      backgroundColor: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderBottom: 'none',
      padding: '0.5rem 1rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      fontSize: '0.875rem',
      color: '#475569',
    }}>
      <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
      <span style={{ fontWeight: '500' }}>{status}</span>
    </div>
  );
}
