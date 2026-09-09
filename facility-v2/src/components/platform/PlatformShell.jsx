import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { PRODUCT_PACKAGES } from '../../data/fixtures';
import { FACILITY_MENU_KEY, Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export const PACKAGE_KEY = 'veyro:facility-v2:demo-package';

export function PlatformShell({ customerName }) {
  const [packageId, setPackageId] = useState(() => {
    const saved = localStorage.getItem(PACKAGE_KEY);
    return PRODUCT_PACKAGES[saved] ? saved : 'facility';
  });
  const [menuOpen, setMenuOpen] = useState(() => localStorage.getItem(FACILITY_MENU_KEY) !== 'false');
  const [mobileOpen, setMobileOpen] = useState(false);
  const selectedPackage = PRODUCT_PACKAGES[packageId];

  useEffect(() => localStorage.setItem(PACKAGE_KEY, packageId), [packageId]);

  return (
    <div className="app-shell">
      <Sidebar
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        includesFleet={selectedPackage.includesFleet}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="app-main">
        <Topbar
          customerName={customerName}
          packageId={packageId}
          packages={PRODUCT_PACKAGES}
          onPackageChange={setPackageId}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="workspace"><Outlet /></main>
      </div>
    </div>
  );
}
