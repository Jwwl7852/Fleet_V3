import { NavLink } from 'react-router-dom';
import { facilityNavigation } from '../../routes/navigation';
import { Icon } from '../shared/Icon';
import { VeyroLogo } from './VeyroLogo';

export const FACILITY_MENU_KEY = 'veyro:facility-v2:facility-menu-open';

function NavItem({ to, icon, children, end, onNavigate }) {
  return (
    <NavLink to={to} end={end} onClick={onNavigate} className={({ isActive }) => `sidebar-link${isActive ? ' is-active' : ''}`}>
      <Icon name={icon} size={18} />
      <span>{children}</span>
    </NavLink>
  );
}

export function Sidebar({ menuOpen, setMenuOpen, includesFleet, mobileOpen, onCloseMobile }) {
  function toggleMenu() {
    setMenuOpen((value) => {
      const next = !value;
      localStorage.setItem(FACILITY_MENU_KEY, String(next));
      return next;
    });
  }

  return (
    <>
      <button className={`sidebar-scrim${mobileOpen ? ' is-visible' : ''}`} aria-label="Luk menu" onClick={onCloseMobile} />
      <aside className={`sidebar${mobileOpen ? ' is-mobile-open' : ''}`} aria-label="Primær navigation">
        <div className="sidebar-logo-row">
          <VeyroLogo />
          <button className="icon-button sidebar-mobile-close" aria-label="Luk menu" onClick={onCloseMobile}><Icon name="close" /></button>
        </div>
        <nav className="sidebar-nav">
          <NavItem to="/platform" icon="dashboard" onNavigate={onCloseMobile}>Platformoverblik</NavItem>
          <NavItem to="/fakturacenter" icon="invoice" onNavigate={onCloseMobile}>Fakturacenter</NavItem>
          {includesFleet && <NavItem to="/fleet" icon="fleet" onNavigate={onCloseMobile}>FLEET</NavItem>}
          <button className={`sidebar-module${menuOpen ? ' is-open' : ''}`} onClick={toggleMenu} aria-expanded={menuOpen}>
            <span><Icon name="building" size={19} /> FACILITY</span>
            <Icon name="chevron" size={17} />
          </button>
          {menuOpen && (
            <div className="sidebar-subnav">
              {facilityNavigation.map((item) => (
                <NavItem key={item.path} to={item.path} end={item.path === '/facility'} icon={item.icon} onNavigate={onCloseMobile}>{item.label}</NavItem>
              ))}
            </div>
          )}
        </nav>
        <div className="sidebar-footer">
          <span>FACILITY v2 · Etape 3–7</span>
          <span>Lokale demodata</span>
        </div>
      </aside>
    </>
  );
}
