import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { LabelItem, PageListItem, SiteWrite } from '../../../shared/site';
import type { TagRecord } from '../../../shared/project';
import { ApiError, api } from '../api';
import { translateEmpty } from '../translate';

const emptySite: SiteWrite = {
  siteName: '',
  taglineNl: '',
  taglineEn: '',
  email: '',
  phone: '',
  whatsapp: '',
  instagram: '',
  linkedin: '',
  vcfName: '',
  vcfCompany: '',
  vcfTitle: '',
};

export function TextsPage() {
  const [site, setSite] = useState<SiteWrite>(emptySite);
  const [labels, setLabels] = useState<LabelItem[]>([]);
  const [pages, setPages] = useState<PageListItem[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<SiteWrite>('api/site'),
      api<LabelItem[]>('api/labels'),
      api<PageListItem[]>('api/pages'),
      api<TagRecord[]>('api/tags'),
    ])
      .then(([siteRow, labelRows, pageRows, tagRows]) => {
        setSite(siteRow);
        setLabels(labelRows);
        setPages(pageRows);
        setTags(tagRows);
        setLoading(false);
      })
      .catch((reason: unknown) => setError(reason instanceof ApiError ? reason.message : 'Laden mislukt.'));
  }, []);

  function setLabel(key: string, field: 'nl' | 'en', value: string) {
    setSaved(false);
    setLabels((current) => current.map((item) => (item.key === key ? { ...item, [field]: value } : item)));
  }

  function setTag(id: number, field: 'nameNl' | 'nameEn', value: string) {
    setSaved(false);
    setTags((current) => current.map((tag) => (tag.id === id ? { ...tag, [field]: value } : tag)));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const [siteRow, labelRows] = await Promise.all([
        api<SiteWrite>('api/site', { method: 'PATCH', body: JSON.stringify(site) }),
        api<LabelItem[]>('api/labels', {
          method: 'PATCH',
          body: JSON.stringify({ items: labels.map(({ key, nl, en }) => ({ key, nl, en })) }),
        }),
        ...tags.map((tag) =>
          api<TagRecord>(`api/tags/${tag.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ nameNl: tag.nameNl, nameEn: tag.nameEn }),
          }),
        ),
      ]);
      setSite(siteRow);
      setLabels(labelRows);
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
      const pairs = [
        { nl: site.taglineNl, en: site.taglineEn },
        ...labels.map((item) => ({ nl: item.nl, en: item.en })),
        ...tags.map((tag) => ({ nl: tag.nameNl, en: tag.nameEn })),
      ];
      const result = await translateEmpty(pairs);
      if (!result.changed) {
        setTranslated('De Engelse velden wijken al af van het Nederlands.');
        return;
      }
      const [taglineEn = '', ...rest] = result.texts;
      const labelTexts = rest.slice(0, labels.length);
      const tagTexts = rest.slice(labels.length);
      setSite((current) => ({ ...current, taglineEn }));
      setLabels((current) => current.map((item, index) => ({ ...item, en: labelTexts[index] ?? item.en })));
      setTags((current) => current.map((tag, index) => ({ ...tag, nameEn: tagTexts[index] ?? tag.nameEn })));
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

  return (
    <form onSubmit={(event) => void save(event)}>
      <h1 className="page-title">Teksten</h1>
      <p className="hint">Engelse velden die leeg blijven, vallen terug op Nederlands. Teksten van een project wijzig je bij Projecten.</p>
      {error ? <p className="alert">{error}</p> : null}
      {saved ? <p className="ok">Opgeslagen.</p> : null}
      {translated ? <p className="ok">{translated}</p> : null}

      <div className="groups">
        <section>
          <h2>Site</h2>
          <label>
            <span>Naam</span>
            <input value={site.siteName} onChange={(event) => setSite({ ...site, siteName: event.target.value })} required />
          </label>
          <div className="grid-2">
            <label>
              <span>Tagline (NL)</span>
              <input value={site.taglineNl} onChange={(event) => setSite({ ...site, taglineNl: event.target.value })} />
            </label>
            <label>
              <span>Tagline (EN)</span>
              <input value={site.taglineEn} onChange={(event) => setSite({ ...site, taglineEn: event.target.value })} />
            </label>
          </div>
          <div className="grid-2">
            <label>
              <span>E-mail</span>
              <input value={site.email} onChange={(event) => setSite({ ...site, email: event.target.value })} inputMode="email" />
            </label>
            <label>
              <span>Telefoon</span>
              <input value={site.phone} onChange={(event) => setSite({ ...site, phone: event.target.value })} />
            </label>
            <label>
              <span>WhatsApp</span>
              <input value={site.whatsapp} onChange={(event) => setSite({ ...site, whatsapp: event.target.value })} />
            </label>
            <label>
              <span>Instagram</span>
              <input value={site.instagram} onChange={(event) => setSite({ ...site, instagram: event.target.value })} />
            </label>
            <label>
              <span>LinkedIn</span>
              <input value={site.linkedin} onChange={(event) => setSite({ ...site, linkedin: event.target.value })} />
            </label>
          </div>
          <h2>Contactkaart</h2>
          <p className="hint">Deze gegevens komen in het bestand dat iemand opslaat via Contact opslaan.</p>
          <div className="grid-2">
            <label>
              <span>Naam</span>
              <input value={site.vcfName} onChange={(event) => setSite({ ...site, vcfName: event.target.value })} />
            </label>
            <label>
              <span>Bedrijf</span>
              <input value={site.vcfCompany} onChange={(event) => setSite({ ...site, vcfCompany: event.target.value })} />
            </label>
            <label>
              <span>Functie</span>
              <input value={site.vcfTitle} onChange={(event) => setSite({ ...site, vcfTitle: event.target.value })} />
            </label>
          </div>
        </section>

        <section>
          <h2>Pagina’s</h2>
          <ul className="list">
            {pages.map((page) => (
              <li key={page.id}>
                <Link className="row text-row" to={`/teksten/${page.id}`}>
                  <strong>{page.titleNl}</strong>
                  <span className="muted">{page.slug === 'home' ? 'Intro op de homepage' : 'Menu en paginatekst'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Menu, knoppen en meldingen</h2>
          {labels.map((item) => (
            <div className="grid-2" key={item.key}>
              <label>
                <span>{item.label} (NL)</span>
                <input value={item.nl} onChange={(event) => setLabel(item.key, 'nl', event.target.value)} required />
              </label>
              <label>
                <span>{item.label} (EN)</span>
                <input value={item.en} onChange={(event) => setLabel(item.key, 'en', event.target.value)} />
              </label>
            </div>
          ))}
        </section>

        {tags.length ? (
          <section>
            <h2>Tags</h2>
            {tags.map((tag) => (
              <div className="grid-2" key={tag.id}>
                <label>
                  <span>Tag (NL)</span>
                  <input value={tag.nameNl} onChange={(event) => setTag(tag.id, 'nameNl', event.target.value)} required />
                </label>
                <label>
                  <span>Tag (EN)</span>
                  <input value={tag.nameEn} onChange={(event) => setTag(tag.id, 'nameEn', event.target.value)} />
                </label>
              </div>
            ))}
          </section>
        ) : null}
      </div>

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
