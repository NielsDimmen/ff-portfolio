import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { GalleryItem, ProjectDetail, ProjectWrite, TagRecord } from '../../../shared/project';
import { slugify } from '../../../shared/slug';
import { ApiError, api, mediaUrl, publicProjectUrl, uploadFile } from '../api';
import { CLAUDE_PROJECT_PROMPT, parseProjectCsv } from '../csv';
import { translateEmpty } from '../translate';

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
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadLabel, setUploadLabel] = useState('');
  const galleryInput = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState('');
  const [csvNote, setCsvNote] = useState('');
  const [copied, setCopied] = useState(false);
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

  async function persist(next: ProjectWrite) {
    if (projectId === null) return;
    const updated = await api<ProjectDetail>(`api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(next),
    });
    setForm(updated);
    setGallery(updated.gallery);
    setFocal({ x: updated.focalX, y: updated.focalY });
    setSaved(true);
  }

  async function chooseCover(item: GalleryItem) {
    if (form.coverMediaId === item.mediaId) return;
    const next = { ...form, coverMediaId: item.mediaId };
    setError('');
    setForm(next);
    setFocal({ x: item.focalX, y: item.focalY });
    try {
      await persist(next);
    } catch (reason) {
      setSaved(false);
      setError(reason instanceof ApiError ? reason.message : 'Cover kiezen mislukt.');
    }
  }

  async function onFocal(event: MouseEvent<HTMLImageElement>) {
    if (!form.coverMediaId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const focalX = clamp((event.clientX - rect.left) / rect.width);
    const focalY = clamp((event.clientY - rect.top) / rect.height);
    setFocal({ x: focalX, y: focalY });
    setGallery((current) =>
      current.map((entry) => (entry.mediaId === form.coverMediaId ? { ...entry, focalX, focalY } : entry)),
    );
    try {
      await api(`api/media/${form.coverMediaId}`, { method: 'PATCH', body: JSON.stringify({ focalX, focalY }) });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Focuspunt opslaan mislukt.');
    }
  }

  async function onGalleryFocal(item: GalleryItem, event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const focalX = clamp((event.clientX - rect.left) / rect.width);
    const focalY = clamp((event.clientY - rect.top) / rect.height);
    setGallery((current) => current.map((entry) => (entry.mediaId === item.mediaId ? { ...entry, focalX, focalY } : entry)));
    if (form.coverMediaId === item.mediaId) setFocal({ x: focalX, y: focalY });
    try {
      await api(`api/media/${item.mediaId}`, { method: 'PATCH', body: JSON.stringify({ focalX, focalY }) });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Focuspunt opslaan mislukt.');
    }
  }

  async function savePhotographer(mediaId: number, value: string) {
    const photographer = value.trim();
    setGallery((current) => current.map((entry) => (entry.mediaId === mediaId ? { ...entry, photographer } : entry)));
    try {
      await api(`api/media/${mediaId}`, { method: 'PATCH', body: JSON.stringify({ photographer }) });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Fotograaf opslaan mislukt.');
    }
  }

  async function onTranslate() {
    setTranslating(true);
    setError('');
    setTranslated('');
    try {
      const result = await translateEmpty([
        { nl: form.titleNl, en: form.titleEn },
        { nl: form.roleNl, en: form.roleEn },
        { nl: form.summaryNl, en: form.summaryEn },
        { nl: form.bodyNl, en: form.bodyEn },
      ]);
      if (!result.changed) {
        setTranslated('De Engelse velden wijken al af van het Nederlands.');
        return;
      }
      const [titleEn = '', roleEn = '', summaryEn = '', bodyEn = ''] = result.texts;
      setForm((current) => ({ ...current, titleEn, roleEn, summaryEn, bodyEn }));
      setSaved(false);
      setTranslated('Engels ingevuld. Sla op om het te bewaren.');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Vertalen mislukt.');
    } finally {
      setTranslating(false);
    }
  }

  async function onPasteCsv() {
    setError('');
    setCsvNote('');
    let parsed;
    try {
      parsed = parseProjectCsv(csv);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'De CSV-regel klopt niet.');
      return;
    }
    setBusy(true);
    try {
      const known = [...tags];
      const tagIds: number[] = [];
      for (const name of parsed.tags) {
        const key = name.toLocaleLowerCase('nl');
        let match = known.find(
          (tag) => tag.nameNl.toLocaleLowerCase('nl') === key || tag.nameEn.toLocaleLowerCase('nl') === key,
        );
        if (!match) {
          match = await api<TagRecord>('api/tags', { method: 'POST', body: JSON.stringify({ nameNl: name }) });
          known.push(match);
        }
        if (!tagIds.includes(match.id)) tagIds.push(match.id);
      }
      setTags(known.sort((a, b) => a.nameNl.localeCompare(b.nameNl, 'nl')));
      setForm((current) => ({
        ...current,
        titleNl: parsed.titleNl,
        titleEn: parsed.titleEn,
        client: parsed.client,
        location: parsed.location,
        year: parsed.year,
        roleNl: parsed.roleNl,
        roleEn: parsed.roleEn,
        summaryNl: parsed.summaryNl,
        summaryEn: parsed.summaryEn,
        bodyNl: parsed.bodyNl,
        bodyEn: parsed.bodyEn,
        videoUrl: parsed.videoUrl,
        slug: slugTouched ? current.slug : slugify(parsed.titleNl),
        tagIds,
      }));
      setSaved(false);
      setCsvNote(
        isNew
          ? 'Ingevuld. Controleer de velden en sla daarna op. Foto’s voeg je na het opslaan toe.'
          : 'Ingevuld. Controleer de velden en sla daarna op. De slug, foto’s en publicatiestatus blijven zoals ze zijn.',
      );
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Tags uit de regel toevoegen mislukt.');
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(CLAUDE_PROJECT_PROMPT);
      setCopied(true);
    } catch {
      setError('Kopiëren lukt niet in deze browser. Selecteer de instructie en kopieer die zelf.');
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
    const list = Array.from(files);
    if (galleryInput.current) galleryInput.current.value = '';
    if (!list.length) return;
    setError('');
    const failed: string[] = [];
    for (let index = 0; index < list.length; index += 1) {
      const file = list[index];
      if (!file) continue;
      setProgress(0);
      setUploadLabel(`Foto ${index + 1} van ${list.length} wordt verwerkt.`);
      try {
        const uploaded = await uploadFile(`api/projects/${projectId}/gallery`, file, setProgress);
        const mediaId = uploaded.mediaId;
        if (mediaId) {
          setGallery((current) => [
            ...current,
            {
              id: uploaded.id,
              mediaId,
              focalX: uploaded.focalX ?? 0.5,
              focalY: uploaded.focalY ?? 0.5,
              photographer: '',
            },
          ]);
        }
      } catch (reason) {
        const message = reason instanceof ApiError ? reason.message : 'Upload mislukt.';
        failed.push(`${file.name} (${message})`);
      }
    }
    setProgress(null);
    setUploadLabel('');
    if (failed.length) {
      setError(`Niet gelukt: ${failed.join(', ')}. De andere foto’s staan erbij.`);
    }
  }

  async function removeGallery(item: GalleryItem) {
    if (projectId === null) return;
    try {
      await api(`api/projects/${projectId}/gallery/${item.id}`, { method: 'DELETE' });
      const next = form.coverMediaId === item.mediaId ? { ...form, coverMediaId: null } : form;
      if (next !== form) {
        setForm(next);
        await persist(next);
      } else {
        setGallery((current) => current.filter((entry) => entry.id !== item.id));
      }
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

      <fieldset className="csv">
        <legend>Plak een regel uit Claude</legend>
        <label>
          <span>CSV-regel</span>
          <textarea value={csv} onChange={(event) => setCsv(event.target.value)} placeholder="titel_nl,titel_en,klant,…" />
        </label>
        <div className="actions">
          <button type="button" onClick={() => void onPasteCsv()} disabled={busy || !csv.trim()}>
            Vul het formulier
          </button>
          <button type="button" className="quiet" onClick={() => void copyPrompt()}>
            {copied ? 'Instructie gekopieerd' : 'Kopieer instructie'}
          </button>
        </div>
        {csvNote ? <p className="ok">{csvNote}</p> : null}
        <details open>
          <summary>Instructie voor Claude</summary>
          <pre className="prompt">{CLAUDE_PROJECT_PROMPT}</pre>
        </details>
      </fieldset>

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
      <div className="actions">
        <button type="button" className="quiet" onClick={() => void onTranslate()} disabled={translating}>
          {translating ? 'Vertalen…' : 'Vertaal naar Engels'}
        </button>
      </div>
      {translated ? <p className="ok">{translated}</p> : null}

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

      {projectId !== null ? (
        <fieldset>
          <legend>Galerij</legend>
          <ul className="gallery">
            {gallery.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="shot"
                  aria-label="Focuspunt verplaatsen"
                  onClick={(event) => void onGalleryFocal(item, event)}
                >
                  <img
                    src={mediaUrl(item.mediaId, 400)}
                    alt=""
                    style={{ objectPosition: `${item.focalX * 100}% ${item.focalY * 100}%` }}
                  />
                  <span className="mark" style={{ left: `${item.focalX * 100}%`, top: `${item.focalY * 100}%` }} />
                </button>
                <input
                  type="text"
                  value={item.photographer}
                  placeholder="Fotograaf"
                  aria-label="Fotograaf"
                  onChange={(event) => {
                    const photographer = event.target.value;
                    setGallery((current) =>
                      current.map((entry) => (entry.mediaId === item.mediaId ? { ...entry, photographer } : entry)),
                    );
                  }}
                  onBlur={(event) => void savePhotographer(item.mediaId, event.target.value)}
                />
                <button
                  type="button"
                  className={form.coverMediaId === item.mediaId ? undefined : 'quiet'}
                  aria-pressed={form.coverMediaId === item.mediaId}
                  onClick={() => void chooseCover(item)}
                >
                  {form.coverMediaId === item.mediaId ? 'Cover' : 'Als cover'}
                </button>
                <button type="button" className="quiet" onClick={() => void removeGallery(item)}>
                  Verwijderen
                </button>
              </li>
            ))}
          </ul>
          <p className="hint">
            {gallery.length
              ? 'Kies een foto als cover. Klik in de foto om het focuspunt te verplaatsen. De fotograaf verschijnt bij de foto.'
              : 'Nog geen foto’s. Voeg ze hier toe en kies daarna de cover.'}
          </p>
          <input
            ref={galleryInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            multiple
            onChange={(event) => void onGallery(event.target.files)}
          />
          {uploadLabel ? <p className="hint">{uploadLabel}</p> : null}
          {progress !== null && uploadLabel ? (
            <div className="bar" aria-label="Upload">
              <span style={{ width: `${progress}%` }} />
            </div>
          ) : null}
        </fieldset>
      ) : (
        <p className="hint">Sla het project eerst op. Daarna voeg je foto’s toe en kies je de cover.</p>
      )}

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
        ) : (
          <p className="hint">Nog geen cover. Kies een galerijfoto.</p>
        )}
        {form.coverMediaId ? (
          <p className="hint">Dit is de foto op de homepage en bovenaan het project. Klik in de foto om het focuspunt te verplaatsen.</p>
        ) : null}
      </fieldset>

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
