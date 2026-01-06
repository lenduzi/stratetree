'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Project, TreeNode } from '@/lib/types';
import { getAllProjects, deleteProject, exportAllData, importData, saveProject } from '@/lib/db';
import { isServerApiKeyConfigured, transcribeAudioAction } from '@/lib/actions';
import { supabase } from '@/lib/supabase';
import { getCloudProjects } from '@/lib/project-actions';
import { v4 as uuidv4 } from 'uuid';
import { ThemeToggle } from '@/components/ThemeProvider';
import { User } from '@supabase/supabase-js';
import { getBrowserApiKey } from '@/lib/settings';
import { useRef } from 'react';

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
    a.download = `stratetree-export-${new Date().toISOString().split('T')[0]}.json`;
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
        <Link href="/" className="logo">
          <span className="logo-icon">🌳</span>
          <span>Stratetree</span>
        </Link>
        <div className="flex items-center gap-sm">
          <button className="btn btn-secondary btn-sm" onClick={handleImport}>
            Import
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleExport}>
            Export
          </button>
          <Link href="/settings" className="btn btn-secondary btn-sm">
            ⚙️ Settings
          </Link>
          {user ? (
            <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
              Logout ({user.email?.split('@')[0]})
            </button>
          ) : (
            <Link href="/login" className="btn btn-primary btn-sm">
              Sign In
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="container">
        <div className="flex items-center justify-between mb-lg">
          <div>
            <h1>Your Strategy Trees</h1>
            <p className="text-muted">Prepare for calls with decision trees</p>
          </div>
          <button
            className="btn btn-primary btn-lg"
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
                  <Link href="/settings" style={{ color: 'var(--accent-secondary)' }}>
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
            <div className="empty-state-title">No projects yet</div>
            <p>Create your first strategy tree to get started.</p>
            <button
              className="btn btn-primary mt-lg"
              onClick={() => setShowNewModal(true)}
            >
              + New Project
            </button>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((project) => (
              <div key={project.id} className="project-card">
                <Link
                  href={`/project/${project.id}`}
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
                      📞 {project.callHistory.length} call{project.callHistory.length !== 1 ? 's' : ''}
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

      {showNewModal && (
        <NewProjectModal
          onClose={() => setShowNewModal(false)}
          onCreate={async (project) => {
            await saveProject(project);
            router.push(`/project/${project.id}`);
          }}
        />
      )}
    </div>
  );
}

function NewProjectModal({
  onClose,
  onCreate
}: {
  onClose: () => void;
  onCreate: (project: Project) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const toggleListening = async () => {
    if (isListening) {
      stopRecording();
    } else {
      await startRecording();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop()); // Release microphone

        await handleTranscription(audioBlob);
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
      setIsProcessing(true);
    }
  };

  const handleTranscription = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');

      // Get browser key if available
      const browserKey = getBrowserApiKey();

      const text = await transcribeAudioAction(formData, browserKey || undefined);

      setDescription(prev => {
        const needsSpace = prev.length > 0 && !prev.endsWith(' ');
        return prev + (needsSpace ? ' ' : '') + text;
      });
    } catch (err) {
      console.error('Transcription failed:', err);
      alert('Failed to transcribe audio. Please check your API key.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreate = () => {
    if (!name.trim()) return;

    const project: Project = {
      id: uuidv4(),
      name: name.trim(),
      description: description.trim(),
      rootNode: {
        id: uuidv4(),
        title: 'Start of call',
        talkingPoints: ['Introduce yourself', 'Set the agenda'],
        questions: ['What are your main priorities right now?', 'What prompted you to take this call?'],
        children: [],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    onCreate(project);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">New Project</h2>

        <div className="flex flex-col gap-md">
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
              Project Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Enterprise Sales Call"
              autoFocus
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-sm">
              <label style={{ display: 'block', fontWeight: 500 }}>
                Context / Description
              </label>
              <button
                type="button"
                onClick={toggleListening}
                disabled={isProcessing}
                className={`btn btn-sm ${isListening ? 'btn-danger' : 'btn-secondary'}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s ease',
                  opacity: isProcessing ? 0.7 : 1
                }}
                title={isListening ? 'Stop recording' : 'Dictate description'}
              >
                {isListening ? (
                  <>
                    <span className="pulsing-dot" style={{
                      width: 8,
                      height: 8,
                      background: 'white',
                      borderRadius: '50%',
                      animation: 'pulse 1.5s infinite'
                    }} />
                    Stop
                  </>
                ) : isProcessing ? (
                  <>
                    <span className="spinner" style={{ width: 12, height: 12, border: '2px solid currentColor', borderRightColor: 'transparent' }} />
                    Processing...
                  </>
                ) : (
                  <>
                    🎤 Dictate
                  </>
                )}
              </button>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the call scenario. This helps AI generate better trees."
              rows={3}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={!name.trim()}
          >
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
}
