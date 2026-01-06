'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Project, TreeNode } from '@/lib/types';
import { getProject, saveProject } from '@/lib/db';
import { generateTreeAction, isServerApiKeyConfigured } from '@/lib/actions';
import { TreeEditor } from '@/components/TreeEditor';
import { ThemeToggle } from '@/components/ThemeProvider';
import { getBrowserApiKey } from '@/lib/settings';

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isServerConfigured, setIsServerConfigured] = useState(false);
    const [showConfirmGen, setShowConfirmGen] = useState(false);

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
            const configured = await isServerApiKeyConfigured();
            setIsServerConfigured(configured);
        }
    };

    const handleTreeChange = async (newRoot: TreeNode) => {
        if (!project) return;
        const updated = { ...project, rootNode: newRoot };
        setProject(updated);
        await saveProject(updated);
    };

    const handleGenerateClick = () => {
        setShowConfirmGen(true);
    };

    const confirmGeneration = async () => {
        if (!project) return;
        setShowConfirmGen(false);
        setGenerating(true);
        setError(null);

        try {
            const newRoot = await generateTreeAction(
                project.description || project.name,
                getBrowserApiKey() || undefined
            );
            await handleTreeChange(newRoot);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to generate tree');
        } finally {
            setGenerating(false);
        }
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

    if (error && !project) {
        return (
            <div className="focused-view">
                <main className="container">
                    <div className="empty-state">
                        <div className="empty-state-icon">❌</div>
                        <div className="empty-state-title">{error}</div>
                        <Link href="/" className="btn btn-primary mt-lg">
                            ← Back to Projects
                        </Link>
                    </div>
                </main>
            </div>
        );
    }

    if (!project) return null;

    return (
        <div className="focused-view">
            <header className="header">
                <div className="flex items-center gap-md">
                    <Link href="/" className="btn btn-secondary btn-sm">
                        ← Back
                    </Link>
                    <div>
                        <h1 style={{ fontSize: '1.1rem', margin: 0 }}>{project.name}</h1>
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                            Preparation Mode
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-sm">
                    <ThemeToggle />
                    <button
                        className="btn btn-secondary"
                        onClick={handleGenerateClick}
                        disabled={generating}
                    >
                        {generating ? (
                            <>
                                <span className="spinner" style={{ width: 16, height: 16 }} />
                                Generating...
                            </>
                        ) : (
                            '✨ Generate with AI'
                        )}
                    </button>
                    <Link
                        href={`/project/${project.id}/live`}
                        className="btn btn-primary btn-lg"
                    >
                        ▶ Start Live Mode
                    </Link>
                </div>
            </header>

            <main className="container">
                {(error || (!isServerConfigured && !getBrowserApiKey())) && (
                    <div
                        className="card mb-lg"
                        style={{
                            borderColor: error ? 'var(--danger)' : 'var(--warning)',
                            background: error ? 'rgba(239, 68, 68, 0.1)' : 'var(--warning-bg)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-md)'
                        }}
                    >
                        <span style={{ fontSize: '1.2rem' }}>{error ? '❌' : '⚠️'}</span>
                        <div style={{ flex: 1 }}>
                            {error ? (
                                <div>{error}</div>
                            ) : (
                                <div>
                                    <strong>No API Key Configured.</strong> AI generation will not work.
                                    Add your key in <Link href="/settings" style={{ color: 'var(--accent-secondary)', fontWeight: 600 }}>Settings</Link>.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {project.description && (
                    <div className="card mb-lg">
                        <h3 style={{ marginBottom: 'var(--space-sm)', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            Scenario Context
                        </h3>
                        <p style={{ margin: 0 }}>{project.description}</p>
                    </div>
                )}

                <div className="card">
                    <div className="flex items-center justify-between mb-md">
                        <h2 style={{ margin: 0 }}>Decision Tree</h2>
                        <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                            Click Edit to modify nodes, + Child to add branches
                        </span>
                    </div>
                    <TreeEditor
                        rootNode={project.rootNode}
                        onChange={handleTreeChange}
                    />
                </div>

                {/* Call History */}
                {project.callHistory && project.callHistory.length > 0 && (
                    <div className="card mt-lg">
                        <h2 style={{ margin: 0, marginBottom: 'var(--space-md)' }}>
                            📞 Call History ({project.callHistory.length})
                        </h2>
                        <div className="flex flex-col gap-md">
                            {project.callHistory.slice().reverse().map((call) => (
                                <div
                                    key={call.id}
                                    style={{
                                        padding: 'var(--space-md)',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: 'var(--radius-md)',
                                        borderLeft: `3px solid ${call.outcome === 'success' ? 'var(--success)' :
                                            call.outcome === 'lost' ? 'var(--danger)' :
                                                call.outcome === 'followup' ? 'var(--warning)' :
                                                    'var(--text-muted)'
                                            }`
                                    }}
                                >
                                    <div className="flex items-center justify-between mb-sm">
                                        <span style={{ fontWeight: 600 }}>
                                            {new Date(call.timestamp).toLocaleString()}
                                        </span>
                                        <span style={{
                                            fontSize: '0.8rem',
                                            padding: '2px 8px',
                                            borderRadius: 'var(--radius-full)',
                                            background: call.outcome === 'success' ? 'var(--success)' :
                                                call.outcome === 'lost' ? 'var(--danger)' :
                                                    call.outcome === 'followup' ? 'var(--warning)' :
                                                        'var(--text-muted)',
                                            color: 'white'
                                        }}>
                                            {call.outcome === 'success' ? '✅ Success' :
                                                call.outcome === 'lost' ? '❌ Lost' :
                                                    call.outcome === 'followup' ? '📅 Follow-up' :
                                                        '📝 Other'}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>
                                        Path: {call.pathTitles.join(' → ')}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', marginBottom: call.userNotes ? 'var(--space-sm)' : 0 }}>
                                        {call.aiSummary}
                                    </div>
                                    {call.userNotes && (
                                        <div style={{
                                            fontSize: '0.85rem',
                                            color: 'var(--text-secondary)',
                                            fontStyle: 'italic',
                                            paddingTop: 'var(--space-sm)',
                                            borderTop: '1px solid var(--border-subtle)'
                                        }}>
                                            Notes: {call.userNotes}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>
            {showConfirmGen && (
                <div className="modal-overlay" onClick={() => setShowConfirmGen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
                        <h2 className="modal-title">✨ Generate Tree with AI</h2>
                        <div style={{ marginBottom: 'var(--space-lg)' }}>
                            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                                This will use the project description to generate a new decision tree structure.
                            </p>
                            <div style={{
                                marginTop: 'var(--space-md)',
                                padding: 'var(--space-md)',
                                background: 'var(--warning-bg)',
                                borderLeft: '4px solid var(--warning)',
                                fontSize: '0.9rem',
                                color: 'var(--text-primary)'
                            }}>
                                ⚠️ <strong>Warning:</strong> This will replace your current tree nodes completely. This action cannot be undone.
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setShowConfirmGen(false)}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={confirmGeneration} autoFocus>
                                Yes, Generate New Tree
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
