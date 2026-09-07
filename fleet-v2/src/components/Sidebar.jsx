import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { platformNavigation } from "../demoData";
import { VeyroLogo } from "./VeyroLogo";

const FLEET_OPEN_KEY = "veyro:fleet-v2:fleet-menu-open";

function readFleetOpen() {
  try {
    const stored = window.localStorage.getItem(FLEET_OPEN_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function Sidebar({ open, onClose, onUnavailable, onNavigate, activePage }) {
  const [fleetOpen, setFleetOpen] = useState(readFleetOpen);

  useEffect(() => {
    try {
      window.localStorage.setItem(FLEET_OPEN_KEY, String(fleetOpen));
    } catch {
      // Local storage can be disabled; the current session still works.
    }
  }, [fleetOpen]);

  const activate = (item) => {
    if (item.implemented) {
      onNavigate(item.path);
      onClose();
    }
    else onUnavailable(item.label);
  };

  return (
    <aside className={`fleet-sidebar${open ? " is-open" : ""}`}>
      <div className="brand">
        <VeyroLogo />
      </div>

      <div className="sidebar-scroll">
        <nav className="side-nav" aria-label="FLEET v2 navigation">
          {platformNavigation.map((group) => (
            <section className="nav-group" key={group.id} aria-labelledby={`nav-group-${group.id}`}>
              <h2 id={`nav-group-${group.id}`}>{group.label}</h2>
              {group.items.map((item) => {
                if (item.id !== "fleet") {
                  return (
                    <button className="nav-item platform-item" key={item.id} onClick={() => onUnavailable(item.label)} type="button">
                      <Icon name={item.icon} size={19} />
                      <span>{item.label}</span>
                    </button>
                  );
                }

                return (
                  <div className="fleet-nav-tree" key={item.id}>
                    <button
                      aria-expanded={fleetOpen}
                      className={`nav-item fleet-parent${activePage ? " has-active-child" : ""}`}
                      onClick={() => setFleetOpen((value) => !value)}
                      type="button"
                    >
                      <Icon name={item.icon} size={19} />
                      <span>{item.label}</span>
                      <Icon className={`nav-chevron${fleetOpen ? " is-open" : ""}`} name="chevron" size={16} />
                    </button>
                    <div className="fleet-subnav" hidden={!fleetOpen}>
                      {item.children.map((child) => (
                        <button
                          aria-current={child.id === activePage ? "page" : undefined}
                          className={`nav-item fleet-child${child.id === activePage ? " is-active" : ""}`}
                          key={child.id}
                          onClick={() => activate(child)}
                          type="button"
                        >
                          <Icon name={child.icon} size={17} />
                          <span>{child.label}</span>
                          {child.badge ? <span className="nav-badge">{child.badge}</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </nav>
      </div>

      <div className="sidebar-footer">
        <div className="version"><span className="status-dot" /> FLEET v2 · Etape 2 · Demo</div>
      </div>
    </aside>
  );
}
