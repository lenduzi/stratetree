'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Project } from '@/lib/types';
import { getAllProjects, deleteProject, exportAllData, importData, saveProject, getProject } from '@/lib/db';
import { isServerApiKeyConfigured } from '@/lib/actions';
import { supabase } from '@/lib/supabase';
import { getCloudProjects } from '@/lib/project-actions';
import { ThemeToggle } from '@/components/ThemeProvider';
import { User } from '@supabase/supabase-js';
import { getBrowserApiKey } from '@/lib/settings';
import { CaptureFlow } from '@/components/CaptureFlow';

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    checkUser();
    loadProjects();
    checkApiKey();
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
      setProjects(data);
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
    router.refresh();
  };

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
              Logout ({user.email?.split('@')[0]})
            </button>
          ) : (
            <Link href="/app/login" className="btn btn-primary btn-sm header-action">
              Sign In
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="container">
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
        ) : projects.length === 0 ? (
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
            {projects.map((project) => (
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
