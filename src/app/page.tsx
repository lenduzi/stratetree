'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Project } from '@/lib/types';
import { getAllProjects, deleteProject, exportAllData, importData, saveProject } from '@/lib/db';
import { isServerApiKeyConfigured, structureProjectAction, transcribeAudioAction } from '@/lib/actions';
import { supabase } from '@/lib/supabase';
import { getCloudProjects } from '@/lib/project-actions';
import { v4 as uuidv4 } from 'uuid';
import { ThemeToggle } from '@/components/ThemeProvider';
import { User } from '@supabase/supabase-js';
import { getBrowserApiKey } from '@/lib/settings';

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
        <div className="flex items-center gap-sm header-actions">
          <button className="btn btn-secondary btn-sm header-action header-import" onClick={handleImport}>
            Import
          </button>
          <button className="btn btn-secondary btn-sm header-action header-export" onClick={handleExport}>
            Export
          </button>
          <Link href="/settings" className="btn btn-secondary btn-sm header-action">
            ⚙️ Settings
          </Link>
          {user ? (
            <button className="btn btn-secondary btn-sm header-action" onClick={handleLogout}>
              Logout ({user.email?.split('@')[0]})
            </button>
          ) : (
            <Link href="/login" className="btn btn-primary btn-sm header-action">
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
            <p className="text-muted">Prepare for calls with decision trees</p>
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
              className="btn btn-primary mt-lg project-cta"
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

      <button
        className="btn btn-primary btn-lg project-cta project-cta-sticky"
        onClick={() => setShowNewModal(true)}
      >
        + New Project
      </button>

      {showNewModal && (
        <NewProjectModal
          onClose={() => setShowNewModal(false)}
          onCreate={async (project) => {
            await saveProject(project);
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
  onCreate: (project: Project) => Promise<void>;
}) {
  const router = useRouter();
  const [captureText, setCaptureText] = useState('');
  const [step, setStep] = useState<'capture' | 'structuring'>('capture');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useHold, setUseHold] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const shouldProcessRef = useRef(true);

  useEffect(() => {
    setUseHold(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    return () => {
      stopRecording(false);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      shouldProcessRef.current = true;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const tracks = mediaStreamRef.current?.getTracks() || [];
        tracks.forEach(track => track.stop());
        mediaStreamRef.current = null;

        if (!shouldProcessRef.current) {
          setIsProcessing(false);
          return;
        }

        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await handleTranscription(audioBlob);
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = (shouldProcess: boolean) => {
    shouldProcessRef.current = shouldProcess;
    if (!shouldProcess && mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
    }
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
      setIsProcessing(true);
    }
    const tracks = mediaStreamRef.current?.getTracks() || [];
    tracks.forEach(track => track.stop());
    mediaStreamRef.current = null;
    if (!shouldProcess) {
      setIsListening(false);
      setIsProcessing(false);
    }
  };

  const handleTranscription = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      const browserKey = getBrowserApiKey();
      const text = await transcribeAudioAction(formData, browserKey || undefined);
      const nextText = `${captureText}${captureText && !captureText.endsWith(' ') ? ' ' : ''}${text}`;
      setCaptureText(nextText);
      await startStructuring(nextText);
    } catch (err) {
      console.error('Transcription failed:', err);
      alert('Failed to transcribe audio. Please check your API key.');
      setIsProcessing(false);
    }
  };

  const toggleListening = async () => {
    if (isListening) {
      stopRecording(true);
    } else {
      await startRecording();
    }
  };

  const startStructuring = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setStep('structuring');
    setError(null);

    const id = draftId || uuidv4();
    setDraftId(id);

    const draft: Project = {
      id,
      name: 'New Project',
      description: '',
      rootNode: {
        id: uuidv4(),
        title: 'Start of call',
        talkingPoints: [],
        questions: [],
        children: [],
      },
      structured: {
        goal: '',
        stakeholder: '',
        context: '',
        decisionFrame: '',
        rawCapture: trimmed,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await onCreate(draft);

    try {
      const browserKey = getBrowserApiKey();
      const { buckets, tree } = await structureProjectAction(trimmed, browserKey || undefined);
      const title = (buckets.title || `${buckets.stakeholder} — ${buckets.goal}`).trim() || 'New Project';
      const updated: Project = {
        ...draft,
        name: title,
        description: buckets.context || trimmed,
        rootNode: tree,
        structured: { ...buckets, rawCapture: trimmed, title },
      };
      await saveProject(updated);
      router.push(`/project/${id}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to structure project');
      setStep('capture');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    stopRecording(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal capture-modal" onClick={(e) => e.stopPropagation()}>
        {step === 'capture' ? (
          <>
            <h2 className="modal-title">New Project</h2>
            <div className="capture-body">
              <button
                type="button"
                className={`capture-mic ${isListening ? 'is-listening' : ''}`}
                onClick={!useHold ? toggleListening : undefined}
                onPointerDown={useHold ? startRecording : undefined}
                onPointerUp={useHold ? stopRecording : undefined}
                onPointerLeave={useHold ? stopRecording : undefined}
                disabled={isProcessing}
              >
                {isListening ? '◼' : '🎤'}
              </button>
              <div className="capture-label">
                Tap to talk
                {isListening && <span className="capture-recording">Recording…</span>}
              </div>
              <textarea
                className="capture-textarea"
                value={captureText}
                onChange={(e) => setCaptureText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    startStructuring(captureText);
                  }
                }}
                placeholder="Talk like you’re leaving a voice note. We’ll structure it."
                rows={4}
              />
              {error && <div className="text-muted" style={{ color: 'var(--danger)' }}>{error}</div>}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={handleClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => startStructuring(captureText)}
                disabled={!captureText.trim()}
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <div className="structuring-state">
            <h2 className="modal-title">Structuring your call…</h2>
            <div className="structuring-skeleton">
              {['Goal', 'Who am I talking to?', 'What’s the situation?', 'If they say X → I say Y'].map((label) => (
                <div key={label} className="skeleton-bucket">
                  <div className="skeleton-label">{label}</div>
                  <div className="skeleton-line" />
                  <div className="skeleton-line short" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
