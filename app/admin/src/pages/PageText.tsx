import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { PageDetail, PageWrite } from '../../../shared/site';
import { ApiError, api } from '../api';
import { translateEmpty } from '../translate';

const empty: PageWrite = { titleNl: '', titleEn: '', bodyNl: '', bodyEn: '', published: true };

export function PageText() {
  const params = useParams();
  const [form, setForm] = useState<PageWrite>(empty);
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<PageDetail>(`api/pages/${params.id}`)
      .then((page) => {
        setForm(page);
        setSlug(page.slug);
        setLoading(false);
      })
      .catch((reason: unknown) => setError(reason instanceof ApiError ? reason.message : 'Laden mislukt.'));
  }, [params.id]);

  function update(patch: Partial<PageWrite>) {
    setSaved(false);
    setForm((current) => ({ ...current, ...patch }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const savedPage = await api<PageDetail>(`api/pages/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      setForm(savedPage);
      setSaved(true);
    } catch (reason: unknown) {
      setError(reason instanceof ApiError ? reason.message : 'Opslaan mislukt.');
    } finally {
      setBusy(false);
    }
  }

  async function onTranslate() {
    setTranslating(true);
    setError('');
    setTranslated('');
    try {
      const result = await translateEmpty([
        { nl: form.titleNl, en: form.titleEn },
        { nl: form.bodyNl, en: form.bodyEn },
      ]);
      if (!result.changed) {
        setTranslated('De Engelse velden wijken al af van het Nederlands.');
        return;
      }
      const [titleEn = '', bodyEn = ''] = result.texts;
      setForm((current) => ({ ...current, titleEn, bodyEn }));
      setSaved(false);
      setTranslated('Engels ingevuld. Sla op om het te bewaren.');
    } catch (reason: unknown) {
      setError(reason instanceof ApiError ? reason.message : 'Vertalen mislukt.');
    } finally {
      setTranslating(false);
    }
  }

  if (error && loading) return <p className="alert">{error}</p>;
  if (loading) return <p className="muted">Laden…</p>;

  const home = slug === 'home';
  return (
    <form onSubmit={(event) => void save(event)}>
      <p className="hint">
        <Link to="/teksten">Terug naar teksten</Link>
      </p>
      <h1 className="page-title">{form.titleNl || 'Pagina'}</h1>
      <p className="hint">
        {home
          ? 'De titel staat in het menu. De tekst is de intro op de homepage. Laat die leeg om de intro te verbergen.'
          : 'De titel staat in het menu. Een lege regel begint een nieuwe alinea. Engelse velden die leeg blijven, vallen terug op Nederlands.'}
      </p>
      {error ? <p className="alert">{error}</p> : null}
      {saved ? <p className="ok">Opgeslagen.</p> : null}
      {translated ? <p className="ok">{translated}</p> : null}
      <div className="grid-2">
        <label>
          <span>Titel (NL)</span>
          <input value={form.titleNl} onChange={(event) => update({ titleNl: event.target.value })} required />
        </label>
        <label>
          <span>Titel (EN)</span>
          <input value={form.titleEn} onChange={(event) => update({ titleEn: event.target.value })} />
        </label>
      </div>
      <label>
        <span>Tekst (NL)</span>
        <textarea value={form.bodyNl} onChange={(event) => update({ bodyNl: event.target.value })} />
      </label>
      <label>
        <span>Tekst (EN)</span>
        <textarea value={form.bodyEn} onChange={(event) => update({ bodyEn: event.target.value })} />
      </label>
      {home ? null : (
        <label className="check">
          <input type="checkbox" checked={form.published} onChange={(event) => update({ published: event.target.checked })} />
          <span>Zichtbaar op de site</span>
        </label>
      )}
      <div className="actions">
        <button type="button" className="quiet" onClick={() => void onTranslate()} disabled={translating}>
          {translating ? 'Vertalen…' : 'Vertaal naar Engels'}
        </button>
        <button type="submit" disabled={busy}>
          {busy ? 'Opslaan…' : 'Opslaan'}
        </button>
      </div>
    </form>
  );
}
