import { useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { GalleryItem, ProjectDetail, ProjectWrite, TagRecord } from '../../../shared/project';
import { slugify } from '../../../shared/slug';
import { ApiError, api, mediaUrl, publicProjectUrl, uploadFile } from '../api';

const empty: ProjectWrite = {
  slug: '',
  titleNl: '',
  titleEn: '',
  client: '',
  location: '',
  year: null,
  roleNl: '',
  roleEn: '',
  summaryNl: '',
  summaryEn: '',
  bodyNl: '',
  bodyEn: '',
  videoUrl: '',
  published: false,
  featured: false,
  coverMediaId: null,
  tagIds: [],
};

export function ProjectForm() {
  const params = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const projectId = params.id ? Number(params.id) : null;
  const isNew = projectId === null;

  const [form, setForm] = useState<ProjectWrite>(empty);
  const [slugTouched, setSlugTouched] = useState(false);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [focal, setFocal] = useState({ x: 0.5, y: 0.5 });
  const [newTag, setNewTag] = useState('');
  const [error, setError] = useState('');
  const justSaved = search.get('saved') === '1';
  const [saved, setSaved] = useState(justSaved);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (justSaved) setSaved(true);
  }, [justSaved]);

  useEffect(() => {
    let cancelled = false;
    api<TagRecord[]>('api/tags')
      .then((rows) => {
        if (!cancelled) setTags(rows);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof ApiError ? reason.message : 'Tags laden mislukt.');
      });
    if (projectId === null || !Number.isInteger(projectId)) return () => { cancelled = true; };
    api<ProjectDetail>(`api/projects/${projectId}`)
      .then((detail) => {
        if (cancelled) return;
        setForm(detail);
        setGallery(detail.gallery);
        setFocal({ x: detail.focalX, y: detail.focalY });
        setSlugTouched(true);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof ApiError ? reason.message : 'Project laden mislukt.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function update<K extends keyof ProjectWrite>(key: K, value: ProjectWrite[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'titleNl' && !slugTouched) next.slug = slugify(String(value));
      return next;
    });
    setSaved(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = { ...form, year: form.year };
      if (isNew) {
        const created = await api<ProjectDetail>('api/projects', { method: 'POST', body: JSON.stringify(payload) });
        navigate(`/projects/${created.id}?saved=1`);
      } else {
        const updated = await api<ProjectDetail>(`api/projects/${projectId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setForm(updated);
        setGallery(updated.gallery);
        setSaved(true);
      }
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Opslaan mislukt.');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (projectId === null || !window.confirm('Dit project verwijderen?')) return;
    setBusy(true);
    try {
      await api(`api/projects/${projectId}`, { method: 'DELETE' });
      navigate('/');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Verwijderen mislukt.');
      setBusy(false);
    }
  }

  async function onCover(file: File | undefined) {
    if (!file) return;
    setError('');
    setProgress(0);
    try {
      const uploaded = await uploadFile('api/media', file, setProgress);
      update('coverMediaId', uploaded.id);
      setFocal({ x: 0.5, y: 0.5 });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Upload mislukt.');
    } finally {
      setProgress(null);
    }
  }

  async function onFocal(event: MouseEvent<HTMLImageElement>) {
    if (!form.coverMediaId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const focalX = clamp((event.clientX - rect.left) / rect.width);
    const focalY = clamp((event.clientY - rect.top) / rect.height);
    setFocal({ x: focalX, y: focalY });
    try {
      await api(`api/media/${form.coverMediaId}`, { method: 'PATCH', body: JSON.stringify({ focalX, focalY }) });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Focuspunt opslaan mislukt.');
    }
  }

  async function addTag() {
    const nameNl = newTag.trim();
    if (!nameNl) return;
    setError('');
    try {
      const created = await api<TagRecord>('api/tags', { method: 'POST', body: JSON.stringify({ nameNl }) });
      setTags((current) => [...current, created].sort((a, b) => a.nameNl.localeCompare(b.nameNl, 'nl')));
      setForm((current) => ({ ...current, tagIds: [...current.tagIds, created.id] }));
      setNewTag('');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Tag toevoegen mislukt.');
    }
  }

  async function onGallery(files: FileList | null) {
    if (!files || projectId === null) return;
    setError('');
    for (const file of files) {
      setProgress(0);
      try {
        const uploaded = await uploadFile(`api/projects/${projectId}/gallery`, file, setProgress);
        const mediaId = uploaded.mediaId;
        if (mediaId) setGallery((current) => [...current, { id: uploaded.id, mediaId }]);
      } catch (reason) {
        setError(reason instanceof ApiError ? reason.message : 'Upload mislukt.');
        break;
      }
    }
    setProgress(null);
  }

  async function removeGallery(item: GalleryItem) {
    if (projectId === null) return;
    try {
      await api(`api/projects/${projectId}/gallery/${item.id}`, { method: 'DELETE' });
      setGallery((current) => current.filter((entry) => entry.id !== item.id));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Foto verwijderen mislukt.');
    }
  }

  if (loading) return <p className="muted">Laden…</p>;

  return (
    <form onSubmit={onSubmit}>
      <h2 className="page-title">{isNew ? 'Nieuw project' : form.titleNl || 'Project'}</h2>
      {error ? <p className="alert">{error}</p> : null}
      {saved ? <p className="ok">Opgeslagen.</p> : null}
      {saved && form.published ? (
        <p className="ok">
          <a href={publicProjectUrl(form.slug)}>Bekijk op de site</a>
        </p>
      ) : null}

      <div className="grid-2">
        <label>
          <span>Titel (NL)</span>
          <input type="text" required value={form.titleNl} onChange={(event) => update('titleNl', event.target.value)} />
        </label>
        <label>
          <span>Titel (EN)</span>
          <input type="text" value={form.titleEn} onChange={(event) => update('titleEn', event.target.value)} />
        </label>
      </div>

      <label>
        <span>Slug</span>
        <input
          type="text"
          required
          value={form.slug}
          onChange={(event) => {
            setSlugTouched(true);
            update('slug', slugify(event.target.value));
          }}
        />
      </label>

      <div className="grid-2">
        <label>
          <span>Klant</span>
          <input type="text" value={form.client} onChange={(event) => update('client', event.target.value)} />
        </label>
        <label>
          <span>Locatie</span>
          <input type="text" value={form.location} onChange={(event) => update('location', event.target.value)} />
        </label>
        <label>
          <span>Jaar</span>
          <input
            type="number"
            min={1900}
            max={2100}
            value={form.year ?? ''}
            onChange={(event) => update('year', event.target.value === '' ? null : Number(event.target.value))}
          />
        </label>
        <label>
          <span>Video (YouTube of Vimeo)</span>
          <input type="url" value={form.videoUrl} onChange={(event) => update('videoUrl', event.target.value)} />
        </label>
        <label>
          <span>Rol (NL)</span>
          <input type="text" value={form.roleNl} onChange={(event) => update('roleNl', event.target.value)} />
        </label>
        <label>
          <span>Rol (EN)</span>
          <input type="text" value={form.roleEn} onChange={(event) => update('roleEn', event.target.value)} />
        </label>
      </div>

      <div className="grid-2">
        <label>
          <span>Korte tekst (NL)</span>
          <textarea value={form.summaryNl} onChange={(event) => update('summaryNl', event.target.value)} />
        </label>
        <label>
          <span>Korte tekst (EN)</span>
          <textarea value={form.summaryEn} onChange={(event) => update('summaryEn', event.target.value)} />
        </label>
        <label>
          <span>Tekst (NL)</span>
          <textarea value={form.bodyNl} onChange={(event) => update('bodyNl', event.target.value)} />
        </label>
        <label>
          <span>Tekst (EN)</span>
          <textarea value={form.bodyEn} onChange={(event) => update('bodyEn', event.target.value)} />
        </label>
      </div>
      <p className="hint">Een lege regel begint een nieuwe alinea. Engelse velden die leeg blijven, vallen terug op Nederlands.</p>

      <fieldset>
        <legend>Tags</legend>
        <div className="tags">
          {tags.map((tag) => (
            <label className="check" key={tag.id}>
              <input
                type="checkbox"
                checked={form.tagIds.includes(tag.id)}
                onChange={() => {
                  const on = form.tagIds.includes(tag.id);
                  update('tagIds', on ? form.tagIds.filter((id) => id !== tag.id) : [...form.tagIds, tag.id]);
                }}
              />
              <span>{tag.nameNl}</span>
            </label>
          ))}
        </div>
        <div className="actions">
          <input type="text" value={newTag} placeholder="Nieuwe tag" onChange={(event) => setNewTag(event.target.value)} />
          <button type="button" className="quiet" onClick={() => void addTag()}>
            Tag toevoegen
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Cover</legend>
        {form.coverMediaId ? (
          <img
            className="cover"
            src={mediaUrl(form.coverMediaId)}
            alt=""
            style={{ objectPosition: `${focal.x * 100}% ${focal.y * 100}%` }}
            onClick={onFocal}
          />
        ) : null}
        <p className="hint">Klik in de foto om het focuspunt te zetten.</p>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          onChange={(event) => void onCover(event.target.files?.[0])}
        />
        {form.coverMediaId ? (
          <button type="button" className="quiet" onClick={() => update('coverMediaId', null)}>
            Cover verwijderen
          </button>
        ) : null}
        {progress !== null ? (
          <div className="bar" aria-label="Upload">
            <span style={{ width: `${progress}%` }} />
          </div>
        ) : null}
      </fieldset>

      {projectId !== null ? (
        <fieldset>
          <legend>Galerij</legend>
          <ul className="gallery">
            {gallery.map((item) => (
              <li key={item.id}>
                <img src={mediaUrl(item.mediaId, 400)} alt="" />
                <button type="button" className="quiet" onClick={() => void removeGallery(item)}>
                  Verwijderen
                </button>
              </li>
            ))}
          </ul>
          <input type="file" accept="image/*" multiple onChange={(event) => void onGallery(event.target.files)} />
        </fieldset>
      ) : (
        <p className="hint">Sla het project eerst op. Daarna kun je galerijfoto’s toevoegen.</p>
      )}

      <label className="check">
        <input type="checkbox" checked={form.published} onChange={(event) => update('published', event.target.checked)} />
        <span>Zichtbaar op de site</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={form.featured} onChange={(event) => update('featured', event.target.checked)} />
        <span>Uitgelicht op de homepage (alleen als het project zichtbaar is)</span>
      </label>

      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Opslaan…' : 'Opslaan'}
        </button>
        <Link className="quiet" to="/">
          Terug
        </Link>
        {projectId !== null ? (
          <button type="button" className="danger" onClick={() => void onDelete()} disabled={busy}>
            Verwijderen
          </button>
        ) : null}
      </div>
    </form>
  );
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}
