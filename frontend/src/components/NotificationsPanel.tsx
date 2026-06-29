import React, { useState, useEffect, useRef } from 'react';

const API = 'http://localhost:8000/api';

interface NotificationsPanelProps {
  token: string;
}

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({ token }) => {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifs = async () => {
    try {
      const res = await fetch(`${API}/dean/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifs(data);
        setUnread(data.filter((n: any) => n.status === 'unread').length);
      }
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, [token]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={styles.bell} title="Notifications">
        🔔
        {unread > 0 && <span style={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div style={styles.dropdown}>
          <div style={styles.header}>
            <span style={styles.headerTitle}>Notifications</span>
            {unread > 0 && <span style={styles.unreadPill}>{unread} new</span>}
          </div>

          <div style={styles.list}>
            {notifs.length === 0 ? (
              <div style={styles.empty}>
                <span style={{ fontSize: '2rem' }}>🔕</span>
                <p>No notifications yet.</p>
              </div>
            ) : notifs.map(n => (
              <div key={n.id} style={{ ...styles.item, ...(n.status === 'unread' ? styles.itemUnread : {}) }}>
                <div style={styles.itemIcon}>🚀</div>
                <div style={styles.itemBody}>
                  <p style={styles.itemMsg}>{n.message}</p>
                  <span style={styles.itemTime}>{new Date(n.created_at).toLocaleString()}</span>
                </div>
                {n.status === 'unread' && <div style={styles.unreadDot}/>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  bell: {
    position: 'relative',
    background: 'rgba(0,0,0,0.03)',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 10,
    padding: '7px 10px',
    cursor: 'pointer',
    fontSize: '1.1rem',
    transition: 'background 0.2s',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    background: '#EF4444',
    color: '#fff',
    fontSize: '0.65rem',
    fontWeight: 800,
    padding: '2px 5px',
    borderRadius: 20,
    minWidth: 18,
    textAlign: 'center',
    lineHeight: '1.4',
  },
  dropdown: {
    position: 'absolute',
    top: '110%',
    right: 0,
    width: 340,
    background: '#FFFFFF',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 14,
    boxShadow: '0 20px 60px rgba(0,0,0,0.1)',
    zIndex: 1000,
    overflow: 'hidden',
    animation: 'fadeIn 0.15s ease',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 18px',
    borderBottom: '1px solid rgba(0,0,0,0.06)',
  },
  headerTitle: { fontWeight: 700, fontSize: '0.9rem', color: '#111827' },
  unreadPill: { background: 'rgba(37,99,235,0.15)', color: '#2563EB', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20 },
  list: { maxHeight: 380, overflowY: 'auto' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', color: '#6B7280', fontSize: '0.85rem' },
  item: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.03)', cursor: 'default', transition: 'background 0.15s' },
  itemUnread: { background: 'rgba(37,99,235,0.06)' },
  itemIcon: { fontSize: '1.2rem', marginTop: 2, flexShrink: 0 },
  itemBody: { flex: 1 },
  itemMsg: { margin: 0, fontSize: '0.82rem', color: '#4B5563', lineHeight: 1.5 },
  itemTime: { fontSize: '0.72rem', color: '#6B7280', marginTop: 4, display: 'block' },
  unreadDot: { width: 8, height: 8, borderRadius: '50%', background: '#2563EB', flexShrink: 0, marginTop: 6 },
};
