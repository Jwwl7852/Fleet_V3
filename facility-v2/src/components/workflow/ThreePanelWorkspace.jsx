import { Children, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  gemVisningsvalg,
  laesVisningsvalg,
  nulstilVisningsvalg,
  visningsnoegle,
} from '../../../../src/fleet/visningsvalg.js';

const clamp = (value, minimum, maximum) => (
  Math.min(maximum, Math.max(minimum, Number(value) || minimum))
);

function useFacilityViewPreference({ actorId, tenantId, screen, property, defaultValue }) {
  const storage = typeof window === 'undefined' ? null : window.localStorage;
  const key = useMemo(() => visningsnoegle({
    miljoe: import.meta.env.MODE,
    brugerId: actorId,
    kontekst: `tenant:${tenantId}`,
    skaerm: screen,
    egenskab: property,
  }), [actorId, property, screen, tenantId]);
  const [value, setValue] = useState(() => laesVisningsvalg(storage, key, defaultValue));

  useEffect(() => setValue(laesVisningsvalg(storage, key, defaultValue)), [defaultValue, key, storage]);

  const update = useCallback((next) => {
    setValue((previous) => {
      const calculated = typeof next === 'function' ? next(previous) : next;
      gemVisningsvalg(storage, key, calculated);
      return calculated;
    });
  }, [key, storage]);
  const reset = useCallback(() => {
    nulstilVisningsvalg(storage, key);
    setValue(defaultValue);
  }, [defaultValue, key, storage]);

  return [value, update, reset];
}

export function ThreePanelWorkspace({
  children,
  actorId,
  tenantId,
  screen,
  className = '',
}) {
  const panels = Children.toArray(children);
  const root = useRef(null);
  const [left, setLeft, resetLeft] = useFacilityViewPreference({
    actorId,
    tenantId,
    screen,
    property: 'panel-left',
    defaultValue: 27,
  });
  const [right, setRight, resetRight] = useFacilityViewPreference({
    actorId,
    tenantId,
    screen,
    property: 'panel-right',
    defaultValue: 28,
  });

  useEffect(() => {
    const reset = (event) => {
      if (!event.detail?.skaerm || event.detail.skaerm === screen || event.detail.skaerm.startsWith(`${screen}/`)) {
        resetLeft();
        resetRight();
      }
    };
    window.addEventListener('veyro:nulstil-visning', reset);
    return () => window.removeEventListener('veyro:nulstil-visning', reset);
  }, [resetLeft, resetRight, screen]);

  const resize = (side, clientX) => {
    const rect = root.current?.getBoundingClientRect();
    if (!rect?.width) return;
    if (side === 'left') {
      setLeft(clamp(((clientX - rect.left) / rect.width) * 100, 18, Math.min(38, 72 - right)));
    } else {
      setRight(clamp(((rect.right - clientX) / rect.width) * 100, 20, Math.min(38, 74 - left)));
    }
  };

  const keyboard = (side, event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') {
      if (side === 'left') resetLeft();
      else resetRight();
      return;
    }
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    if (side === 'left') {
      setLeft((value) => clamp(Number(value) + direction * 2, 18, Math.min(38, 72 - right)));
    } else {
      setRight((value) => clamp(Number(value) - direction * 2, 20, Math.min(38, 74 - left)));
    }
  };

  const handle = (side, value, reset) => (
    <div
      className="facility-panel-handle"
      role="separator"
      tabIndex="0"
      aria-orientation="vertical"
      aria-label={`Juster ${side === 'left' ? 'venstre' : 'højre'} panelbredde`}
      aria-valuemin={side === 'left' ? 18 : 20}
      aria-valuemax="38"
      aria-valuenow={Math.round(Number(value))}
      title="Træk for at ændre bredde. Piletaster justerer; Home nulstiller."
      onDoubleClick={reset}
      onKeyDown={(event) => keyboard(side, event)}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        resize(side, event.clientX);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(side, event.clientX);
      }}
    />
  );

  return (
    <div
      ref={root}
      className={`facility-three-panel ${className}`.trim()}
      style={{
        '--facility-panel-left': `${left}%`,
        '--facility-panel-right': `${right}%`,
      }}
    >
      {panels[0]}
      {handle('left', left, resetLeft)}
      {panels[1]}
      {handle('right', right, resetRight)}
      {panels[2]}
    </div>
  );
}
