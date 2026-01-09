'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Settings, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Project } from '@/lib/types';
import { getAllProjects, deleteProject, saveProject, getProject, ensureSeedProject } from '@/lib/db';
import { isServerApiKeyConfigured } from '@/lib/actions';
import { supabase } from '@/lib/supabase';
import { getCloudProjects } from '@/lib/project-actions';
import { getBrowserApiKey } from '@/lib/settings';
import { CaptureFlow } from '@/components/CaptureFlow';
import { getGuestProjects, migrateGuestProjectsToAccount, setGuestProjects } from '@/lib/guest';
import { v4 as uuidv4 } from 'uuid';
import { User } from '@supabase/supabase-js';

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [guestProjects, setGuestProjectsState] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    checkUser();
    loadProjects();
    checkApiKey();
    loadGuestProjects();
  }, []);

  const checkApiKey = async () => {
    const localKey = getBrowserApiKey();
    if (localKey) {
      setHasApiKey(true);
      return;
    }
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
      const migratedCount = await migrateGuestProjectsToAccount(userId, async (rows) => {
        const { error } = await supabase
          .from('projects')
          .upsert(rows, { onConflict: 'user_id,client_id' });
        if (error) throw error;
      });
      if (migratedCount > 0) {
        loadProjects();
        setGuestProjects([]);
        setGuestProjectsState([]);
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
        await saveProject(p, false);
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

  const handleDeleteProject = async (id: string) => {
    await deleteProject(id);
    loadProjects();
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
              <span className="text-primary-foreground text-lg">🧠</span>
            </div>
            <h1 className="text-xl font-display font-bold">YapMap</h1>
          </div>
          <Button variant="ghost" size="icon" onClick={() => router.push('/settings')}>
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!hasApiKey && (
          <Card className="mb-6 border-destructive/50 bg-destructive/5">
            <CardContent className="py-4">
              <p className="text-sm text-destructive">
                No API key configured.{' '}
                <button
                  onClick={() => router.push('/settings')}
                  className="underline font-medium hover:no-underline"
                >
                  Add your OpenAI API key
                </button>{' '}
                to enable AI features.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="mb-8">
          <Button
            onClick={() => setShowNewModal(true)}
            className="gradient-primary text-primary-foreground hover:opacity-90 transition-opacity"
            size="lg"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Project
          </Button>
        </div>

        {loading ? (
          <div className="text-muted-foreground">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
              <span className="text-muted-foreground text-2xl">🧭</span>
            </div>
            <h2 className="text-lg font-medium mb-2">No projects yet</h2>
            <p className="text-muted-foreground mb-6">
              Create your first conversation map to prepare for your next call
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="group hover:shadow-card transition-shadow cursor-pointer"
                onClick={() => router.push(`/project/${project.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg font-display line-clamp-1">
                      {project.name}
                    </CardTitle>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity -mr-2 -mt-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete project?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete "{project.name}". This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteProject(project.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {project.description || 'No description'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>Updated {formatDate(project.updatedAt)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {showNewModal && (
        <CaptureFlow
          onClose={() => setShowNewModal(false)}
          onComplete={() => {
            setShowNewModal(false);
            loadProjects();
          }}
        />
      )}
    </div>
  );
}
