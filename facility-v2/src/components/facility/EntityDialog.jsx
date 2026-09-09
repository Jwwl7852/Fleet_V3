import { useEffect } from 'react';
import { Icon } from '../shared/Icon';

export function useUnsavedGuard(dirty) {
  useEffect(() => {
    if (!dirty) return undefined;
    const beforeUnload = (event) => { event.preventDefault(); event.returnValue = ''; };
    const interceptLinks = (event) => {
      const anchor = event.target.closest?.('a[href]');
      if (anchor && !window.confirm('Du har ændringer, som ikke er gemt. Vil du forlade siden?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', interceptLinks, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', interceptLinks, true); };
  }, [dirty]);
}

export function EntityDialog({ title, description, children, onClose, dirty = false, wide = false }) {
  useUnsavedGuard(dirty);
  const requestClose = () => { if (!dirty || window.confirm('Vil du lukke uden at gemme dine ændringer?')) onClose(); };
  return (
    <div className="dialog-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section className={`entity-dialog${wide ? ' is-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header><div><h2 id="dialog-title">{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" type="button" aria-label="Luk" onClick={requestClose}><Icon name="close" /></button></header>
        {children}
      </section>
    </div>
  );
}

export function Field({ label, error, required, children, hint, className = '' }) {
  return <label className={`form-field ${className}`}><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{children}{hint && <small>{hint}</small>}{error && <em role="alert">{error}</em>}</label>;
}

export function FormFeedback({ error, success }) {
  if (!error && !success) return null;
  return <div className={`form-feedback${error ? ' is-error' : ' is-success'}`} role="status"><Icon name={error ? 'info' : 'tasks'} size={17} /><div><strong>{error?.message ?? success}</strong>{error?.blockers?.length > 0 && <ul>{error.blockers.map((item) => <li key={item}>{item}</li>)}</ul>}{error?.name === 'RevisionConflictError' && <span>Dine formularfelter er ikke blevet overskrevet.</span>}</div></div>;
}
