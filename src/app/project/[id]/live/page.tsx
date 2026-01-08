'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Project } from '@/lib/types';
import { getProject, saveProject } from '@/lib/db';
import { FocusedView } from '@/components/FocusedView';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function LiveModePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadProject();
    }, [id]);

    const loadProject = async () => {
        try {
            const data = await getProject(id);
            if (data) {
                setProject(data);
            } else {
                setError('Project not found');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load project');
        } finally {
            setLoading(false);
        }
    };

    const handleProjectUpdate = async (updatedProject: Project) => {
        setProject(updatedProject);
        await saveProject(updatedProject, false);
    };

    if (loading) {
        return (
            <div className="focused-view">
                <div className="loading" style={{ height: '100vh' }}>
                    <div className="spinner" />
                </div>
            </div>
        );
    }

    if (error || !project) {
        return (
            <div className="focused-view">
                <main className="container">
                    <div className="empty-state">
                        <div className="empty-state-icon">❌</div>
                        <div className="empty-state-title">{error || 'Project not found'}</div>
                        <Link href="/app" className="btn btn-primary mt-lg">
                            ← Back to Projects
                        </Link>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <ErrorBoundary title="Conversation view failed to render" onRetry={loadProject}>
            <FocusedView
                project={project}
                onProjectUpdate={handleProjectUpdate}
            />
        </ErrorBoundary>
    );
}
