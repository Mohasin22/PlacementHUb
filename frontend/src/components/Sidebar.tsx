import React from 'react';
import {
  DashboardIcon,
  DrivesIcon,
  AnalyticsIcon,
  CalendarIcon,
  UsersIcon,
  UserIcon,
  UploadIcon,
  BuildingIcon,
  ClassIcon
} from './Icons';

interface SidebarNavProps {
  role: 'Dean' | 'TPO' | 'Faculty' | 'Student';
  currentTab: string;
  onTabChange: (tab: string) => void;
  currentView: 'dashboard' | 'profile';
  onViewChange: (view: 'dashboard' | 'profile') => void;
  userName?: string;
}

export const Sidebar: React.FC<SidebarNavProps> = ({
  role,
  currentTab,
  onTabChange,
  currentView,
  onViewChange,
}) => {
  const [isHovered, setIsHovered] = React.useState(false);

  const getNavItems = () => {
    switch (role) {
      case 'TPO':
        return [
          { key: 'drives', label: 'Recruitment Drives', icon: DrivesIcon },
          { key: 'students', label: 'Students', icon: ClassIcon },
          { key: 'analytics', label: 'Analytics', icon: AnalyticsIcon },
          { key: 'events', label: 'Seminars & Events', icon: CalendarIcon },
          { key: 'faculty', label: 'Faculty Coordinators', icon: BuildingIcon },
          { key: 'export', label: 'Export Data', icon: UploadIcon },
        ];
      case 'Dean':
        return [
          { key: 'overview', label: 'Executive Overview', icon: DashboardIcon },
          { key: 'drives', label: 'Drives Oversight', icon: DrivesIcon },
          { key: 'students', label: 'All Students', icon: UsersIcon },
          { key: 'staff', label: 'Manage Staff', icon: BuildingIcon },
          { key: 'analytics', label: 'Analytics Reports', icon: AnalyticsIcon },
        ];
      case 'Faculty':
        return [
          { key: 'reviews', label: 'Pending Approvals', icon: DashboardIcon },
          { key: 'students', label: 'Class Students', icon: UsersIcon },
        ];
      case 'Student':
        return [
          { key: 'profile', label: 'Academic Profile', icon: UserIcon },
          { key: 'drives', label: 'Eligible Drives', icon: DrivesIcon },
          { key: 'events', label: 'Targeted Seminars', icon: CalendarIcon },
        ];
      default:
        return [];
    }
  };

  const navItems = getNavItems();

  const handleSelectTab = (key: string) => {
    onViewChange('dashboard');
    onTabChange(key);
  };

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: isHovered ? 240 : 72,
        background: '#0B192C',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: isHovered ? '20px 16px' : '20px 10px',
        minHeight: '100vh',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        flexShrink: 0,
        color: '#FFFFFF',
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        boxShadow: isHovered ? '4px 0 24px rgba(0, 0, 0, 0.25)' : 'none',
      }}
    >
      <div>
        {/* Top Sidebar Header: Logo & College Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <img
            src="/logo.png"
            alt="GVPCDPGC Logo"
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              objectFit: 'cover',
              flexShrink: 0,
              margin: isHovered ? '0' : '0 auto',
              transition: 'margin 0.3s ease',
            }}
          />
          <div
            style={{
              opacity: isHovered ? 1 : 0,
              maxWidth: isHovered ? 160 : 0,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              transition: 'opacity 0.25s ease, max-width 0.3s ease',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#FFFFFF', letterSpacing: '0.5px', lineHeight: 1.1 }}>
              GVPCDPGC
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 3 }}>
              Placement Portal
            </div>
          </div>
        </div>

        {/* WORKSPACE Header */}
        <div
          style={{
            fontSize: '0.68rem',
            fontWeight: 800,
            color: '#64748B',
            letterSpacing: '1px',
            margin: isHovered ? '20px 0 10px 8px' : '20px 0 10px 0',
            textAlign: isHovered ? 'left' : 'center',
            textTransform: 'uppercase',
            opacity: isHovered ? 1 : 0,
            height: isHovered ? 16 : 0,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            transition: 'opacity 0.25s ease, height 0.3s ease, margin 0.3s ease',
          }}
        >
          WORKSPACE
        </div>

        {/* Nav List */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {navItems.map(item => {
            const IconComp = item.icon;
            const isActive = currentView === 'dashboard' && currentTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => handleSelectTab(item.key)}
                title={!isHovered ? item.label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: isHovered ? 12 : 0,
                  justifyContent: isHovered ? 'flex-start' : 'center',
                  padding: isHovered ? '10px 14px' : '12px 10px',
                  borderRadius: 10,
                  border: 'none',
                  background: isActive ? '#2563EB' : 'transparent',
                  color: isActive ? '#FFFFFF' : '#94A3B8',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  width: '100%',
                  position: 'relative',
                }}
              >
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconComp size={19} color={isActive ? '#FFFFFF' : '#94A3B8'} />
                </div>
                <span
                  style={{
                    opacity: isHovered ? 1 : 0,
                    maxWidth: isHovered ? 160 : 0,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    transition: 'opacity 0.25s ease, max-width 0.3s ease',
                  }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Signed in as Footer Box */}
      <div
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: isHovered ? '12px 14px' : '10px 6px',
          marginTop: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: isHovered ? 'flex-start' : 'center',
          transition: 'all 0.3s ease',
          overflow: 'hidden',
        }}
      >
        {isHovered ? (
          <div style={{ width: '100%', whiteSpace: 'nowrap', opacity: 1, transition: 'opacity 0.25s ease' }}>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>
              Signed in as
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#FFFFFF', marginTop: 2 }}>
              {role}
            </div>
          </div>
        ) : (
          <div
            title={`Signed in as ${role}`}
            style={{
              fontSize: '0.75rem',
              fontWeight: 800,
              color: '#FFFFFF',
              background: '#2563EB',
              width: 28,
              height: 28,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {role[0]}
          </div>
        )}
      </div>
    </aside>
  );
};
