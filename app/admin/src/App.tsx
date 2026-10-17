import { Link, Route, Routes } from 'react-router';
import { ProjectForm } from './pages/ProjectForm';
import { ProjectList } from './pages/ProjectList';

export function App() {
  const site = document.querySelector('meta[name="public-origin"]')?.getAttribute('content') ?? '';
  return (
    <div className="shell">
      <header className="top">
        <Link to="/" className="quiet">
          <h1>Projecten</h1>
        </Link>
        <p className="tools">
          {site ? (
            <a className="quiet" href={site}>
              Bekijk site
            </a>
          ) : null}
          <Link className="button" to="/projects/new">
            Nieuw project
          </Link>
        </p>
      </header>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/projects/new" element={<ProjectForm />} />
        <Route path="/projects/:id" element={<ProjectForm />} />
      </Routes>
    </div>
  );
}
