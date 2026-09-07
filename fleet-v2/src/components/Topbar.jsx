import { useState } from "react";
import { Icon } from "./Icon";

export function Topbar({ meta, onMenu, onUnavailable }) {
  const [query, setQuery] = useState("");
  const [companyOpen, setCompanyOpen] = useState(false);

  return (
    <header className="topbar">
      <button className="mobile-menu" onClick={onMenu} type="button" aria-label="Åbn menu">
        <Icon name="menu" />
      </button>

      <div className="company-wrap">
        <button className="company-picker" onClick={() => setCompanyOpen((value) => !value)} type="button" aria-expanded={companyOpen}>
          <Icon name="building" size={18} />
          <span>{meta.company}</span>
          <Icon name="down" size={15} />
        </button>
        {companyOpen ? (
          <div className="company-popover" role="status">
            <strong>{meta.company}</strong>
            <span>Lokalt demomiljø</span>
          </div>
        ) : null}
      </div>

      <label className="global-search">
        <Icon name="search" size={18} />
        <input
          aria-label="Søg i FLEET v2-demodata"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onUnavailable("Søgning");
          }}
          placeholder="Søg efter enheder, indberetninger, dokumenter ..."
          value={query}
        />
        <kbd>⌘ K</kbd>
      </label>

      <div className="user-zone">
        <button className="notification-button" onClick={() => onUnavailable("Notifikationer")} type="button" aria-label="Notifikationer">
          <Icon name="bell" size={20} />
          <span>3</span>
        </button>
        <span className="top-divider" />
        <button className="user-button" onClick={() => onUnavailable("Brugermenu")} type="button">
          <span className="avatar">{meta.initials}</span>
          <span className="user-copy"><strong>{meta.user}</strong><small>{meta.role}</small></span>
          <Icon name="down" size={15} />
        </button>
      </div>
    </header>
  );
}
