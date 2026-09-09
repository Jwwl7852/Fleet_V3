import { useEffect, useState } from 'react';
import { useFacilityData } from '../../data/FacilityDataContext';
import { Icon } from '../shared/Icon';
import { FormFeedback } from './EntityDialog';

function useMediaUrl(mediaId) {
  const { repository } = useFacilityData(); const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true; let objectUrl = '';
    if (mediaId) repository.getMediaBlob(mediaId).then((blob) => { if (active && blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [mediaId, repository]);
  return url;
}

async function ensureImageCanLoad(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Vælg et JPEG-, PNG- eller WebP-billede.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Billedet må højst fylde 20 MB.');
  if (typeof createImageBitmap === 'function') { const bitmap = await createImageBitmap(file); bitmap.close(); return; }
  await new Promise((resolve, reject) => { const image = new Image(); const url = URL.createObjectURL(file); image.onload = () => { URL.revokeObjectURL(url); resolve(); }; image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Filen kunne ikke indlæses som et billede.')); }; image.src = url; });
}

function GalleryImage({ metadata, primary, onPrimary, onRemove }) {
  const url = useMediaUrl(metadata.id);
  return <figure className="gallery-image">{url ? <img src={url} alt={metadata.fileName} /> : <span className="image-loading">Indlæser …</span>}<figcaption><span title={metadata.fileName}>{metadata.fileName}</span>{primary ? <b>Hovedbillede</b> : <button type="button" onClick={onPrimary}>Vælg som hovedbillede</button>}<button type="button" onClick={onRemove}>Fjern fra profil</button></figcaption></figure>;
}

export function ProfileImage({ entity, variant = 'office', fallback }) {
  const { dataset } = useFacilityData(); const metadata = dataset?.media?.find((item) => item.id === entity?.primaryImageId); const url = useMediaUrl(metadata?.id);
  if (url) return <img className="profile-main-image" src={url} alt={metadata.fileName} />;
  return fallback?.(variant) ?? <div className="profile-image-empty"><Icon name="building" size={32} /><span>Intet hovedbillede</span></div>;
}

export function ImageGallery({ entityType, entity }) {
  const { dataset, runMutation } = useFacilityData(); const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const images = (entity.imageIds ?? []).map((id) => dataset.media.find((item) => item.id === id)).filter(Boolean);
  async function upload(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; setError(null); setBusy(true);
    try { await ensureImageCanLoad(file); await runMutation('addImage', entityType, entity.id, entity.revision, file); } catch (reason) { setError(reason); } finally { setBusy(false); }
  }
  async function mutate(method, imageId) { setError(null); setBusy(true); try { await runMutation(method, entityType, entity.id, entity.revision, imageId); } catch (reason) { setError(reason); } finally { setBusy(false); } }
  return <section className="profile-images"><div className="section-heading"><div><h2>Billeder</h2><p>JPEG, PNG eller WebP · maks. 20 MB</p></div><label className={`secondary-button file-button${busy ? ' is-disabled' : ''}`}><Icon name="report" size={16} /> {busy ? 'Behandler …' : 'Tilføj billede'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={upload} /></label></div><FormFeedback error={error} />{images.length ? <div className="gallery-grid">{images.map((image) => <GalleryImage key={image.id} metadata={image} primary={entity.primaryImageId === image.id} onPrimary={() => mutate('setPrimaryImage', image.id)} onRemove={() => mutate('removeImage', image.id)} />)}</div> : <div className="empty-state compact"><strong>Ingen billeder</strong><span>Tilføj et billede for at vise det på profilen og ejendomsoversigten.</span></div>}</section>;
}
