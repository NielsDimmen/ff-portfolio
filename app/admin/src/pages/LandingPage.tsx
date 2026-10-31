import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { PageListItem, SiteWrite } from '../../../shared/site';
import type { ProjectListItem } from '../../../shared/project';
import { ApiError, api, mediaUrl } from '../api';
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

export function LandingPage() {
  const [site, setSite] = useState<SiteWrite>(emptySite);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [homeId, setHomeId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api<SiteWrite>('api/site'), api<ProjectListItem[]>('api/projects'), api<PageListItem[]>('api/pages')])
      .then(([siteRow, projectRows, pageRows]) => {
        setSite(siteRow);
        setProjects(projectRows);
        setHomeId(pageRows.find((page) => page.slug === 'home')?.id ?? null);
        setLoading(false);
      })
      .catch((reason: unknown) => setError(reason instanceof ApiError ? reason.message : 'Laden mislukt.'));
  }, []);

  function update(patch: Partial<SiteWrite>) {
    setSaved(false);
    setTranslated('');
    setSite((current) => ({ ...current, ...patch }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const savedSite = await api<SiteWrite>('api/site', { method: 'PATCH', body: JSON.stringify(site) });
      setSite(savedSite);
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
      const result = await translateEmpty([{ nl: site.taglineNl, en: site.taglineEn }]);
      if (!result.changed) {
        setTranslated('De Engelse zin wijkt al af van het Nederlands.');
        return;
      }
      const [taglineEn = ''] = result.texts;
      setSite((current) => ({ ...current, taglineEn }));
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

  const published = projects.filter((project) => project.published);
  const featured = published.filter((project) => project.featured);

  return (
    <>
      <h1 className="page-title">Landing</h1>
      <p className="lead">
        Dit is de pagina die de site toont. De slideshow draait foto's van zichtbare projecten. Uitgelichte projecten staan eronder.
      </p>
      {error ? <p className="alert">{error}</p> : null}
      <form onSubmit={save}>
        <section className="section">
          <h2>Naam en zin</h2>
          <label>
            <span>Naam</span>
            <input type="text" value={site.siteName} onChange={(event) => update({ siteName: event.target.value })} />
          </label>
          <div className="grid-2">
            <label>
              <span>Zin (NL)</span>
              <input type="text" value={site.taglineNl} onChange={(event) => update({ taglineNl: event.target.value })} />
            </label>
            <label>
              <span>Zin (EN)</span>
              <input type="text" value={site.taglineEn} onChange={(event) => update({ taglineEn: event.target.value })} />
            </label>
          </div>
          <p className="actions">
            <button type="button" className="quiet" disabled={translating} onClick={() => void onTranslate()}>
              {translating ? 'Bezig…' : 'Vertaal de zin'}
            </button>
            {translated ? <span className="ok">{translated}</span> : null}
          </p>
        </section>
        <section className="section">
          <h2>Contact</h2>
          <div className="grid-2">
            <label>
              <span>E-mail</span>
              <input type="text" value={site.email} onChange={(event) => update({ email: event.target.value })} />
            </label>
            <label>
              <span>Telefoon</span>
              <input type="text" value={site.phone} onChange={(event) => update({ phone: event.target.value })} />
            </label>
            <label>
              <span>WhatsApp</span>
              <input type="text" value={site.whatsapp} onChange={(event) => update({ whatsapp: event.target.value })} />
            </label>
            <label>
              <span>Instagram</span>
              <input type="text" value={site.instagram} onChange={(event) => update({ instagram: event.target.value })} />
            </label>
          </div>
        </section>
        <p className="actions">
          <button type="submit" disabled={busy}>
            {busy ? 'Opslaan…' : 'Opslaan'}
          </button>
          {saved ? <span className="ok">Opgeslagen.</span> : null}
        </p>
      </form>
      <section className="section">
        <h2>Slideshow</h2>
        <p className="muted">
          {published.length === 0
            ? 'Nog geen zichtbaar project. Een concept komt niet in de slideshow.'
            : `${published.length} zichtbaar. Rol en fotograaf vul je in het project.`}
        </p>
        <ProjectRows projects={published} empty="Zet een project op zichtbaar om het hier te zien." />
      </section>
      <section className="section">
        <h2>Uitgelicht</h2>
        <p className="muted">Deze projecten staan onder de foto, met titel en cover.</p>
        <ProjectRows projects={featured} empty="Vink Uitgelicht aan bij een zichtbaar project." />
      </section>
      {homeId ? (
        <p className="actions">
          <Link className="quiet" to={`/teksten/${homeId}`}>
            Intro op de landing
          </Link>
        </p>
      ) : null}
    </>
  );
}

function ProjectRows(props: { projects: ProjectListItem[]; empty: string }) {
  if (props.projects.length === 0) return <p className="muted">{props.empty}</p>;
  return (
    <ul className="list">
      {props.projects.map((project) => (
        <li key={project.id}>
          <Link className="row" to={`/projects/${project.id}`}>
            {project.coverMediaId ? (
              <img className="thumb" src={mediaUrl(project.coverMediaId, 400)} alt="" />
            ) : (
              <span className="thumb-empty" />
            )}
            <span>
              <strong>{project.titleNl}</strong>
              <p className="muted">{[project.client, project.year].filter(Boolean).join(' · ') || 'Geen klant'}</p>
            </span>
            <span className="badges">
              {project.featured ? <span className="badge">Uitgelicht</span> : null}
              <span className="badge">Zichtbaar</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
