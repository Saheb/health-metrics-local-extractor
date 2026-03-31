import React, { useState, useEffect } from 'react';

const FitbitIntegration = () => {
  const [status, setStatus] = useState({ connected: false, auth_url: '', loading: true, error: null });
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/fitbit/status');
      const data = await res.json();
      setStatus({
        connected: data.connected,
        auth_url: data.auth_url || '',
        loading: false,
        error: data.error || null
      });
    } catch (err) {
      console.error("Failed to fetch Fitbit status", err);
      setStatus(prev => ({ ...prev, loading: false, error: err.message }));
    }
  };

  useEffect(() => {
    fetchStatus();
    // Re-check periodically in case user authenticates in another tab
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleConnect = () => {
    if (status.auth_url) {
      // Open Fitbit auth page in a new tab
      window.open(status.auth_url, '_blank', 'width=600,height=700');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    
    try {
      const res = await fetch('/api/fitbit/pull', { method: 'POST' });
      const data = await res.json();
      
      if (res.ok && data.status === 'success') {
        setSyncResult(data.data);
      } else {
        throw new Error(data.detail || 'Failed to sync data');
      }
    } catch (err) {
      setSyncError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  if (status.loading && !status.connected) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Fitbit status...</div>;
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#0f172a' }}>
        <span style={{ fontSize: '1.5rem' }}>🔗</span> Fitbit Integration
      </h2>
      <p style={{ color: '#64748b', marginBottom: '2rem' }}>
        Pull your Sleep and Active Zone Minutes directly from Fitbit into your local health dashboard.
      </p>

      {status.error && (
        <div style={{ padding: '1rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '4px', marginBottom: '1.5rem' }}>
          <strong>Error:</strong> {status.error}
          {!status.auth_url && <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Check that FITBIT_CLIENT_ID and FITBIT_CLIENT_SECRET are properly configured in backend/.env</p>}
        </div>
      )}

      {!status.connected ? (
        <div style={{ textAlign: 'center', padding: '2rem', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
          <p style={{ marginBottom: '1.5rem', color: '#475569' }}>
            You are not connected to Fitbit. Connect your account to enable automatic data pulling.
          </p>
          <button 
            onClick={handleConnect}
            disabled={!status.auth_url}
            style={{ 
              background: '#00B0B9', // Fitbit branding color
              color: 'white', 
              border: 'none', 
              padding: '0.75rem 1.5rem', 
              borderRadius: '6px',
              fontSize: '1rem',
              cursor: status.auth_url ? 'pointer' : 'not-allowed',
              opacity: status.auth_url ? 1 : 0.6,
              fontWeight: '600'
            }}
          >
            Connect to Fitbit
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', padding: '1rem', background: '#f0fdf4', color: '#166534', borderRadius: '4px' }}>
            <span style={{ fontSize: '1.2rem' }}>✅</span> 
            <strong>Connected to Fitbit</strong>
          </div>

          <div style={{ marginTop: '2rem', padding: '1.5rem', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <h3 style={{ marginBottom: '1rem', color: '#1e293b' }}>Sync Data</h3>
            <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              First sync pulls all historical data dating back to 2018. Subsequent syncs will only pull data from your last sync date to today.
            </p>

            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                background: '#2563eb',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                fontSize: '1rem',
                cursor: syncing ? 'wait' : 'pointer',
                opacity: syncing ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                width: '100%',
                justifyContent: 'center',
                fontWeight: '600'
              }}
            >
              {syncing ? 'Syncing data from Fitbit...' : 'Pull Last Data from Fitbit'}
            </button>

            {syncError && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '4px' }}>
                {syncError}
              </div>
            )}

            {syncResult && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                <h4 style={{ marginBottom: '0.5rem', color: '#0f172a' }}>Sync Complete</h4>
                <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#475569' }}>
                  <li>Sleep records added: {syncResult.sleep_records_synced}</li>
                  <li>Active Zone Minutes added: {syncResult.azm_records_synced}</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FitbitIntegration;
