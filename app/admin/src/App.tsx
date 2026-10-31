import { Link, NavLink, Route, Routes, useLocation } from 'react-router';
import { LandingPage } from './pages/LandingPage';
import { PageText } from './pages/PageText';
import { ProjectForm } from './pages/ProjectForm';
import { ProjectList } from './pages/ProjectList';
import { TextsPage } from './pages/TextsPage';

export function App() {
  const site = document.querySelector('meta[name="public-origin"]')?.getAttribute('content') ?? '';
  const path = useLocation().pathname;
  const texts = path.startsWith('/teksten');
  const projects = path === '/projecten' || path.startsWith('/projects');
  const landing = path === '/';
  return (
    <div className="shell">
      <header className="top">
        <nav className="brand" aria-label="Beheer">
          <Link to="/" className={landing ? 'quiet current' : 'quiet'} aria-current={landing ? 'page' : undefined}>
            Landing
          </Link>
          <Link to="/projecten" className={projects ? 'quiet current' : 'quiet'} aria-current={projects ? 'page' : undefined}>
            Projecten
          </Link>
          <Link to="/teksten" className={texts ? 'quiet current' : 'quiet'} aria-current={texts ? 'page' : undefined}>
            Teksten
          </Link>
        </nav>
        <p className="tools">
          {site ? (
            <a className="quiet" href={site}>
              Bekijk site
            </a>
          ) : null}
          <NavLink className="button" to="/projects/new">
            Nieuw project
          </NavLink>
        </p>
      </header>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/projecten" element={<ProjectList />} />
        <Route path="/teksten" element={<TextsPage />} />
        <Route path="/teksten/:id" element={<PageText />} />
        <Route path="/projects/new" element={<ProjectForm />} />
        <Route path="/projects/:id" element={<ProjectForm />} />
      </Routes>
    </div>
  );
}
