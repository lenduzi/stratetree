'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Project } from '@/lib/types';
import { getAllProjects, deleteProject, exportAllData, importData, saveProject, getProject, ensureSeedProject } from '@/lib/db';
import { isServerApiKeyConfigured } from '@/lib/actions';
import { supabase } from '@/lib/supabase';
import { getCloudProjects } from '@/lib/project-actions';
import { ThemeToggle } from '@/components/ThemeProvider';
import { User } from '@supabase/supabase-js';
import { getBrowserApiKey } from '@/lib/settings';
import { CaptureFlow } from '@/components/CaptureFlow';
import { getGuestProjects, migrateGuestProjectsToAccount, setGuestProjects } from '@/lib/guest';
import { v4 as uuidv4 } from 'uuid';

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [guestProjects, setGuestProjectsState] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [signOutMessage, setSignOutMessage] = useState(false);
  const [migrationToast, setMigrationToast] = useState(false);

  useEffect(() => {
    checkUser();
    loadProjects();
    checkApiKey();
    loadGuestProjects();
  }, []);

  const checkApiKey = async () => {
    // Check local storage immediately for faster UI update
    const localKey = getBrowserApiKey();
    if (localKey) {
      setHasApiKey(true);
      return;
    }

    // Otherwise check the server
    try {
      const configured = await isServerApiKeyConfigured();
      setHasApiKey(configured);
    } catch (e) {
      console.error('Failed to check server API key:', e);
      setHasApiKey(false);
    }
  };

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (user) {
      syncCloudToLocal();
      syncPendingSummary();
      await migrateGuests(user.id);
    }
  };

  const loadGuestProjects = () => {
    const projects = getGuestProjects();
    setGuestProjectsState(projects);
  };

  const ensureClientId = async (project: Project, sync = false) => {
    if (!project.client_id) {
      project.client_id = uuidv4();
      await saveProject(project, sync);
    }
    return project;
  };

  const migrateGuests = async (userId: string) => {
    if (!supabase?.auth) return;
    try {
      console.log('[guest] attempting migration');
      const migratedCount = await migrateGuestProjectsToAccount(userId, async (rows) => {
        const { error } = await supabase
          .from('projects')
          .upsert(rows, { onConflict: 'user_id,client_id' });
        if (error) throw error;
      });
      if (migratedCount > 0) {
        console.log('[guest] migrated', migratedCount);
        setMigrationToast(true);
        loadProjects();
        setGuestProjects([]);
        setGuestProjectsState([]);
        window.setTimeout(() => setMigrationToast(false), 1200);
      }
    } catch (e) {
      console.warn('Guest migration failed', e);
    }
  };

  const syncPendingSummary = async () => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem('yapmap-pending-summary');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { projectId?: string };
      if (!parsed.projectId) return;
      const project = await getProject(parsed.projectId);
      if (project) {
        await saveProject(project, true);
      }
      localStorage.removeItem('yapmap-pending-summary');
    } catch (e) {
      console.warn('Failed to sync pending summary', e);
    }
  };

  const syncCloudToLocal = async () => {
    try {
      const cloudProjects = await getCloudProjects();
      for (const p of cloudProjects) {
        await saveProject(p, false); // Save locally without pushing back
      }
      loadProjects();
    } catch (e) {
      console.error('Sync failed:', e);
    }
  };

  const loadProjects = async () => {
    try {
      const data = await getAllProjects();
      if (data.length === 0) {
        await ensureSeedProject();
      }
      const refreshed = data.length === 0 ? await getAllProjects() : data;
      const normalized = await Promise.all(refreshed.map((project) => ensureClientId(project, !!user)));
      setProjects(normalized);
    } catch (e) {
      console.error('Failed to load projects:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    const data = await exportAllData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yapmap-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        const count = await importData(text);
        alert(`Imported ${count} project(s)`);
        loadProjects();
      }
    };
    input.click();
  };

  const handleDeleteProject = async (id: string, name: string) => {
    if (confirm(`Delete "${name}"? This cannot be undone.`)) {
      await deleteProject(id);
      loadProjects();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSignOutMessage(true);
    window.setTimeout(() => {
      router.replace('/');
      router.refresh();
    }, 600);
  };

  const handleGuestGoogle = async () => {
    if (!supabase?.auth) return;
    if (typeof window !== 'undefined') {
      localStorage.setItem('yapmap-auth-redirect', '/app');
    }
    const origin = window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    });
  };

  const logoutLabel = (() => {
    const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name;
    if (typeof fullName === 'string' && fullName.trim()) {
      const first = fullName.trim().split(/\s+/)[0];
      return `Log out (${first})`;
    }
    return 'Log out';
  })();

  return (
    <div className="focused-view">
      <header className="header">
        <Link href="/app" className="logo">
          <span className="logo-icon">🌳</span>
          <span>YapMap</span>
        </Link>
        <div className="flex items-center gap-sm header-actions">
          <button className="btn btn-secondary btn-sm header-action header-import" onClick={handleImport}>
            Import
          </button>
          <button className="btn btn-secondary btn-sm header-action header-export" onClick={handleExport}>
            Export
          </button>
          <Link href="/app/settings" className="btn btn-secondary btn-sm header-action">
            ⚙️ Settings
          </Link>
          {user ? (
            <button className="btn btn-secondary btn-sm header-action" onClick={handleLogout}>
              {logoutLabel}
            </button>
          ) : (
            <Link href="/login?redirect=/app" className="btn btn-primary btn-sm header-action">
              Sign In
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="container">
        {signOutMessage && (
          <div className="card mb-lg" style={{ padding: 'var(--space-sm)', textAlign: 'center' }}>
            <span className="text-muted">Signed out</span>
          </div>
        )}
        {migrationToast && (
          <div className="card mb-lg" style={{ padding: 'var(--space-sm)', textAlign: 'center' }}>
            <span className="text-muted">✅ Imported your guest YapMap to your free account.</span>
          </div>
        )}
        {!user && guestProjects.length > 0 && (
          <div className="card mb-lg">
            <strong>Guest mode</strong>
            <p className="text-muted" style={{ marginBottom: 'var(--space-sm)' }}>
              This YapMap is saved locally on this device only. Create a free account to sync and save more.
            </p>
            <div className="flex flex-col gap-sm">
              <button className="btn btn-google w-full" onClick={handleGuestGoogle}>
                <span className="google-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 48 48" role="img" focusable="false">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.9-6.9C35.86 2.7 30.28 0 24 0 14.62 0 6.51 5.38 2.56 13.22l8.12 6.3C12.6 13.09 17.86 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.5 24.5c0-1.57-.15-3.08-.41-4.5H24v9h12.66c-.55 2.96-2.2 5.46-4.66 7.14l7.44 5.77c4.35-4.01 6.86-9.92 6.86-17.41z"/>
                    <path fill="#FBBC05" d="M10.68 28.52c-.48-1.45-.76-3-.76-4.52s.28-3.07.76-4.52l-8.12-6.3C.92 16.47 0 20.13 0 24s.92 7.53 2.56 10.82l8.12-6.3z"/>
                    <path fill="#34A853" d="M24 48c6.28 0 11.56-2.07 15.41-5.59l-7.44-5.77c-2.07 1.39-4.72 2.21-7.97 2.21-6.14 0-11.4-3.59-13.32-8.52l-8.12 6.3C6.51 42.62 14.62 48 24 48z"/>
                    <path fill="none" d="M0 0h48v48H0z"/>
                  </svg>
                </span>
                <span>Continue with Google</span>
              </button>
              <Link href="/login?redirect=/app" className="btn btn-secondary w-full">
                Continue with email
              </Link>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between mb-lg project-hero">
          <div>
            <h1>Your Strategy Trees</h1>
            <p className="text-muted">Prepare for conversations with decision trees</p>
          </div>
          <button
            className="btn btn-primary btn-lg project-cta project-cta-desktop"
            onClick={() => setShowNewModal(true)}
          >
            + New Project
          </button>
        </div>

        {!hasApiKey && (
          <div
            className="card mb-lg"
            style={{
              borderColor: 'var(--warning)',
              background: 'var(--warning-bg)'
            }}
          >
            <div className="flex items-center gap-md">
              <span style={{ fontSize: '1.5rem' }}>⚠️</span>
              <div>
                <strong>OpenAI API key not configured</strong>
                <p className="text-muted" style={{ margin: 0 }}>
                  Add your API key in{' '}
                  <Link href="/app/settings" style={{ color: 'var(--accent-secondary)' }}>
                    Settings
                  </Link>
                  {' '}to enable AI tree generation.
                </p>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading">
            <div className="spinner" />
          </div>
        ) : (user ? projects : guestProjects).length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🌱</div>
            <div className="empty-state-title">Prepare your first conversation</div>
            <p>Tap “New Project” to dictate a scenario and generate your tree.</p>
            <button
              className="btn btn-primary mt-lg project-cta"
              onClick={() => setShowNewModal(true)}
            >
              New Project
            </button>
          </div>
        ) : (
          <div className="project-grid">
            {(user ? projects : guestProjects).slice(0, 1).map((project) => (
              <div key={project.id} className="project-card">
                <Link
                  href={`/app/project/${project.id}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div className="project-name">{project.name}</div>
                  <div className="project-description">{project.description}</div>
                </Link>
                <div className="project-meta">
                  <span>
                    Updated {new Date(project.updatedAt).toLocaleDateString()}
                  </span>
                  {project.callHistory && project.callHistory.length > 0 && (
                    <span style={{ color: 'var(--accent-secondary)' }}>
                      💬 {project.callHistory.length} conversation{project.callHistory.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDeleteProject(project.id, project.name);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: 0,
                      marginLeft: 'auto',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <div className="project-cta-sticky">
        <button
          className="btn btn-primary btn-lg project-cta"
          onClick={() => setShowNewModal(true)}
        >
          + New Project
        </button>
      </div>

      {showNewModal && (
        <NewProjectModal
          onClose={() => setShowNewModal(false)}
          isGuest={!user}
        />
      )}
    </div>
  );
}

function NewProjectModal({
  onClose,
  isGuest
}: {
  onClose: () => void;
  isGuest: boolean;
}) {
  const router = useRouter();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal capture-modal" onClick={(e) => e.stopPropagation()}>
        <CaptureFlow
          title="New Project"
          primaryLabel="Create my YapMap"
          showCancel
          isGuest={isGuest}
          onClose={onClose}
          onComplete={(projectId) => {
            onClose();
            router.push(`/app/project/${projectId}`);
          }}
        />
      </div>
    </div>
  );
}
