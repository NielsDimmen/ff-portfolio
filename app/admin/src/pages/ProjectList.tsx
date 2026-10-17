import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { ProjectListItem } from '../../../shared/project';
import { ApiError, api, mediaUrl } from '../api';

export function ProjectList() {
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<ProjectListItem[]>('api/projects')
      .then(setProjects)
      .catch((reason: unknown) => setError(reason instanceof ApiError ? reason.message : 'Laden mislukt.'));
  }, []);

  if (error) return <p className="alert">{error}</p>;
  if (!projects) return <p className="muted">Laden…</p>;

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? projects.filter((project) => `${project.titleNl} ${project.client}`.toLowerCase().includes(needle))
    : projects;

  return (
    <>
      <label>
        <span>Zoeken</span>
        <input type="text" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {visible.length === 0 ? <p className="muted">Nog geen projecten.</p> : null}
      <ul className="list">
        {visible.map((project) => (
          <li key={project.id}>
            <Link className="row" to={`/projects/${project.id}`}>
              {project.coverMediaId ? (
                <img className="thumb" src={mediaUrl(project.coverMediaId, 400)} alt="" />
              ) : (
                <span className="thumb-empty" />
              )}
              <span>
                <strong>{project.titleNl}</strong>
                <p className="muted">
                  {[project.client, project.year].filter(Boolean).join(' · ') || 'Geen klant'}
                </p>
              </span>
              <span className="badge">{project.published ? 'Zichtbaar' : 'Concept'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
