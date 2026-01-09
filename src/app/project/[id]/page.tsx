'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Project, StructuredBuckets, TreeNode } from '@/lib/types';
import { getProject, saveProject } from '@/lib/db';
import { generateTreeAction, isServerApiKeyConfigured, regenerateBucketAction, generateObjectionHandlersAction } from '@/lib/actions';
import { TreeEditor } from '@/components/TreeEditor';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemeToggle } from '@/components/ThemeProvider';
import { getBrowserApiKey } from '@/lib/settings';
import { getClientId } from '@/lib/client-id';
import { summarizeObjectionQuality } from '@/lib/objection-validator';
import { OBJECTION_ARCHETYPES, applyHardMode, buildObjectionNode, suggestTopArchetypes } from '@/lib/objection-archetypes';
import { addChildToNode } from '@/lib/hooks';

type EditableBucketKey = Exclude<keyof StructuredBuckets, 'router' | 'rawCapture' | 'objectionHandlers'>;

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isServerConfigured, setIsServerConfigured] = useState(false);
    const [showConfirmGen, setShowConfirmGen] = useState(false);
    const [editingKey, setEditingKey] = useState<EditableBucketKey | null>(null);
    const [draftValue, setDraftValue] = useState('');
    const [bucketLoading, setBucketLoading] = useState<Record<string, boolean>>({});
    const [showOptional, setShowOptional] = useState(false);
    const [showRawCapture, setShowRawCapture] = useState(false);
    const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>([]);
    const [showArchetypes, setShowArchetypes] = useState(false);
    const [showQualityPanel, setShowQualityPanel] = useState(false);
    const [showIntake, setShowIntake] = useState(false);

    useEffect(() => {
        loadProject();
    }, [id]);

    const loadProject = async () => {
        try {
            const data = await getProject(id);
            if (data) {
                setProject(data);
                setSelectedArchetypes(data.structured?.selectedArchetypes || []);
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

    const updateStructured = async (nextStructured: StructuredBuckets) => {
        if (!project) return;
        const nextProject = { ...project, structured: nextStructured };
        setProject(nextProject);
        await saveProject(nextProject);
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
                getBrowserApiKey() || undefined,
                getClientId(),
                project.structured?.router
            );
            await handleTreeChange(newRoot);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to generate tree');
        } finally {
            setGenerating(false);
        }
    };

    const retryGeneration = async () => {
        if (!project) return;
        setGenerating(true);
        setError(null);
        try {
            const newRoot = await generateTreeAction(
                project.description || project.name,
                getBrowserApiKey() || undefined,
                getClientId(),
                project.structured?.router
            );
            await handleTreeChange(newRoot);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to generate tree');
        } finally {
            setGenerating(false);
        }
    };

    const startEdit = (key: EditableBucketKey) => {
        if (!project?.structured) return;
        setEditingKey(key);
        const value = project.structured[key];
        setDraftValue(typeof value === 'string' ? value : '');
    };

    const saveEdit = async () => {
        if (!project || !project.structured || !editingKey) return;
        const nextStructured = { ...project.structured, [editingKey]: draftValue };
        const nextProject = {
            ...project,
            name: editingKey === 'title' ? (draftValue || project.name) : project.name,
            structured: nextStructured,
        };
        setProject(nextProject);
        await saveProject(nextProject);
        setEditingKey(null);
    };

    const handleRegenerate = async (key: EditableBucketKey) => {
        if (!project?.structured?.rawCapture) return;
        setBucketLoading((prev) => ({ ...prev, [key]: true }));
        setError(null);
        try {
            const browserKey = getBrowserApiKey();
            const { value, tree } = await regenerateBucketAction(
                key,
                project.structured.rawCapture,
                project.structured,
                browserKey || undefined,
                getClientId()
            );
            const nextStructured = { ...project.structured, [key]: value };
            const nextProject = {
                ...project,
                name: key === 'title' ? (value || project.name) : project.name,
                rootNode: tree || project.rootNode,
                structured: nextStructured,
            };
            setProject(nextProject);
            await saveProject(nextProject);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to regenerate');
        } finally {
            setBucketLoading((prev) => ({ ...prev, [key]: false }));
        }
    };

    const isBucketLoading = (key: EditableBucketKey) => !!bucketLoading[key];

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
                    <Link href="/app" className="btn btn-primary mt-lg">
                            ← Back to Projects
                        </Link>
                    </div>
                </main>
            </div>
        );
    }

    if (!project) return null;

    const structured = project.structured;
    const isStructured = !!structured?.goal;
    const requiredBuckets: { key: EditableBucketKey; label: string }[] = [
        { key: 'goal', label: 'Goal' },
        { key: 'stakeholder', label: 'Who am I talking to?' },
        { key: 'context', label: 'What’s the situation?' },
        { key: 'decisionFrame', label: 'If they say X → I say Y' },
    ];
    const optionalBuckets: { key: EditableBucketKey; label: string }[] = [
        { key: 'redFlags', label: 'Red flags / likely objections' },
        { key: 'nonNegotiables', label: 'Non-negotiables' },
        { key: 'tone', label: 'Tone' },
    ];
    const hasOptional = optionalBuckets.some((bucket) => structured?.[bucket.key]);
    const objectionSummary = summarizeObjectionQuality(project.rootNode);
    const callModeReady = objectionSummary.total > 0 && objectionSummary.blocking === 0;
    const cachedLocal = true;
    const offlineReady = callModeReady;
    const hasQualityIssues = objectionSummary.blocking > 0;
    const intake = structured?.intake || {};
    const suggestedArchetypes = suggestTopArchetypes({ capture: structured?.rawCapture || project.description, intake });
    const activeArchetypes = showArchetypes ? OBJECTION_ARCHETYPES : suggestedArchetypes;

    const toggleArchetype = (key: string) => {
        setSelectedArchetypes((prev) => {
            const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
            updateStructured({
                ...(project?.structured || structured)!,
                selectedArchetypes: next,
            });
            return next;
        });
    };

    const applyArchetypes = async () => {
        if (!project) return;
        let updatedRoot = project.rootNode;
        const existingTitles = new Set(project.rootNode.children.map((child) => child.title.toLowerCase()));
        selectedArchetypes.forEach((key) => {
            const arch = OBJECTION_ARCHETYPES.find((item) => item.key === key);
            if (!arch) return;
            if (existingTitles.has(arch.label.toLowerCase())) return;
            const node = buildObjectionNode(arch);
            updatedRoot = addChildToNode(updatedRoot, project.rootNode.id, node);
        });
        const updated = { ...project, rootNode: updatedRoot };
        setProject(updated);
        await saveProject(updated);
    };

    const applyHardModeToTree = async () => {
        if (!project) return;
        const walk = (node: TreeNode): TreeNode => {
            const updated = node.type === 'objection' && node.objectionBundle
                ? { ...node, objectionBundle: applyHardMode(node.objectionBundle) }
                : node;
            return { ...updated, children: updated.children.map(walk) };
        };
        const updatedRoot = walk(project.rootNode);
        const updated = { ...project, rootNode: updatedRoot };
        setProject(updated);
        await saveProject(updated);
    };

    const repairObjections = async () => {
        if (!project || !project.structured) return;
        setGenerating(true);
        try {
            const repairedHandlers = await generateObjectionHandlersAction(
                project.structured.router!,
                project.structured,
                getBrowserApiKey() || undefined,
                getClientId()
            );
            const updated = {
                ...project,
                structured: {
                    ...project.structured,
                    objectionHandlers: repairedHandlers,
                },
            };
            setProject(updated);
            await saveProject(updated);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to repair objections');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="focused-view prep-mode">
            <header className="header call-topbar">
                <div className="call-topbar-left">
                    <Link href="/app" className="btn btn-secondary btn-sm call-back-btn">
                        ← Back
                    </Link>
                    <div className="call-topbar-title">
                        <span className="call-title-primary">
                            {project.name?.split('—')[0]?.trim() || project.name || 'Conversation'}
                        </span>
                        <span className="call-title-secondary">Preparation mode</span>
                    </div>
                </div>
                <div className="call-topbar-actions">
                    <div className="flex gap-sm">
                        <Link href={`/app/project/${project.id}/build`} className="btn btn-primary btn-sm">
                            Build
                        </Link>
                        <Link href={`/app/project/${project.id}/call`} className="btn btn-secondary btn-sm">
                            Call
                        </Link>
                    </div>
                    <button className="panic-info-btn" aria-label="Help">
                        ?
                    </button>
                </div>
            </header>

            <main className="container">
                <div className="prep-cta-spacer" />
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
                                    Add your key in <Link href="/app/settings" style={{ color: 'var(--accent-secondary)', fontWeight: 600 }}>Settings</Link>.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {hasQualityIssues && (
                    <div
                        className="card mb-lg"
                        style={{
                            borderColor: 'var(--warning)',
                            background: 'var(--warning-bg)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-md)'
                        }}
                    >
                        <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Quality issues detected</div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                {objectionSummary.blocking} blocking issue{objectionSummary.blocking !== 1 ? 's' : ''} found. Repair to unlock Call Mode quality.
                            </div>
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowQualityPanel((prev) => !prev)}>
                            {showQualityPanel ? 'Hide details' : 'View details'}
                        </button>
                    </div>
                )}

                {showQualityPanel && (
                    <div
                        className="card mb-lg"
                        style={{
                            borderColor: callModeReady ? 'var(--success)' : 'var(--warning)',
                            background: callModeReady ? 'var(--success-bg)' : 'var(--warning-bg)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-md)'
                        }}
                    >
                        <span style={{ fontSize: '1.2rem' }}>{callModeReady ? '✅' : '⚠️'}</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Call Mode Ready</div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                Objection nodes: {objectionSummary.total || 0} • Blocking issues: {objectionSummary.blocking} • Warnings: {objectionSummary.warnings} • Avg score: {objectionSummary.averageScore || 0}
                                <div style={{ marginTop: 6 }}>
                                    Cached locally: {cachedLocal ? 'Yes' : 'No'} • Offline-ready: {offlineReady ? 'Yes' : 'No'}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {isStructured ? (
                    <div className="overview">
                        <div className="card mb-lg" style={{ padding: 'var(--space-lg)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <div style={{ fontWeight: 600 }}>Refine scenario</div>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowIntake((prev) => !prev)}>
                                    {showIntake ? 'Hide' : 'Edit'}
                                </button>
                            </div>
                            {showIntake && (
                                <div className="grid" style={{ gap: 'var(--space-sm)' }}>
                                    <div>
                                        <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 6 }}>Conversation type</div>
                                        <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                                            {['deal', 'feedback', 'price', 'conflict', 'performance'].map((value) => (
                                                <button
                                                    key={value}
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ background: intake.conversationType === value ? 'var(--accent-soft)' : undefined }}
                                                    onClick={() => updateStructured({
                                                        ...structured!,
                                                        intake: { ...intake, conversationType: value },
                                                    })}
                                                >
                                                    {value}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 6 }}>Counterpart</div>
                                        <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                                            {['boss', 'client', 'partner', 'friend', 'employee'].map((value) => (
                                                <button
                                                    key={value}
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ background: intake.counterpart === value ? 'var(--accent-soft)' : undefined }}
                                                    onClick={() => updateStructured({
                                                        ...structured!,
                                                        intake: { ...intake, counterpart: value },
                                                    })}
                                                >
                                                    {value}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 6 }}>Goal</div>
                                        <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                                            {['get yes', 'clarify scope', 'clean no', 'repair relationship'].map((value) => (
                                                <button
                                                    key={value}
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ background: intake.goalType === value ? 'var(--accent-soft)' : undefined }}
                                                    onClick={() => updateStructured({
                                                        ...structured!,
                                                        intake: { ...intake, goalType: value },
                                                    })}
                                                >
                                                    {value}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 6 }}>Sensitive area</div>
                                        <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                                            {['budget', 'time', 'risk', 'trust', 'brand', 'control', 'politics'].map((value) => (
                                                <button
                                                    key={value}
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ background: intake.sensitiveArea === value ? 'var(--accent-soft)' : undefined }}
                                                    onClick={() => updateStructured({
                                                        ...structured!,
                                                        intake: { ...intake, sensitiveArea: value },
                                                    })}
                                                >
                                                    {value}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="card mb-lg" style={{ padding: 'var(--space-lg)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <div style={{ fontWeight: 600 }}>Objection archetypes (Top 8)</div>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowArchetypes((prev) => !prev)}>
                                    {showArchetypes ? 'Show suggested' : 'Show all'}
                                </button>
                            </div>
                            <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                                {activeArchetypes.map((arch) => (
                                    <button
                                        key={arch.key}
                                        className="btn btn-secondary btn-sm"
                                        style={{
                                            background: selectedArchetypes.includes(arch.key) ? 'var(--accent-soft)' : undefined,
                                        }}
                                        onClick={() => toggleArchetype(arch.key)}
                                    >
                                        {arch.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-sm" style={{ marginTop: 'var(--space-md)' }}>
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={applyArchetypes}
                                    disabled={selectedArchetypes.length === 0}
                                >
                                    Generate objection nodes
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={applyHardModeToTree}>
                                    Make it hard
                                </button>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={repairObjections}
                                    disabled={generating || !project.structured?.router}
                                >
                                    Repair objection bundles
                                </button>
                            </div>
                            {!project.structured?.router && (
                                <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>
                                    Generate a structure first to repair objection bundles.
                                </div>
                            )}
                        </div>
                        <div className="overview-title">
                            {editingKey === 'title' ? (
                                <input
                                    value={draftValue}
                                    onChange={(e) => setDraftValue(e.target.value)}
                                    onBlur={saveEdit}
                                    autoFocus
                                />
                            ) : (
                                <h1>{project.name}</h1>
                            )}
                            <div className="bucket-actions">
                                <button
                                    className="bucket-action"
                                    onClick={() => startEdit('title')}
                                    disabled={isBucketLoading('title')}
                                >
                                    ✎ Edit
                                </button>
                                <button
                                    className="bucket-action"
                                    onClick={() => handleRegenerate('title')}
                                    disabled={isBucketLoading('title')}
                                >
                                    ↻
                                </button>
                                {isBucketLoading('title') && <span className="bucket-spinner" />}
                            </div>
                        </div>

                        <div className="overview-buckets">
                            {requiredBuckets.map(({ key, label }) => (
                                <div key={key} className="overview-bucket">
                                    <div className="bucket-header">
                                        <span className="bucket-title">{label}</span>
                                        <div className="bucket-actions">
                                            <button
                                                className="bucket-action"
                                                onClick={() => startEdit(key)}
                                                disabled={isBucketLoading(key)}
                                            >
                                                ✎ Edit
                                            </button>
                                            <button
                                                className="bucket-action"
                                                onClick={() => handleRegenerate(key)}
                                                disabled={isBucketLoading(key)}
                                            >
                                                ↻
                                            </button>
                                            {isBucketLoading(key) && <span className="bucket-spinner" />}
                                        </div>
                                    </div>
                                    {editingKey === key ? (
                                        <textarea
                                            value={draftValue}
                                            onChange={(e) => setDraftValue(e.target.value)}
                                            onBlur={saveEdit}
                                            autoFocus
                                            rows={3}
                                        />
                                    ) : (
                                        <div className={`bucket-body${isBucketLoading(key) ? ' is-loading' : ''}`}>
                                            {typeof structured?.[key] === 'string' ? structured?.[key] : '—'}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {hasOptional && (
                            <div className="overview-optional">
                                <div className="prep-toggle-row">
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setShowOptional((prev) => !prev)}
                                    >
                                        {showOptional ? 'Hide details' : 'Show details'}
                                    </button>
                                    {structured?.rawCapture && (
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => setShowRawCapture((prev) => !prev)}
                                        >
                                            {showRawCapture ? 'Hide raw capture' : 'Show raw capture'}
                                        </button>
                                    )}
                                </div>
                                {showOptional && (
                                    <div className="overview-buckets mt-md">
                                        {optionalBuckets.map(({ key, label }) => (
                                            structured?.[key] ? (
                                                <div key={key} className="overview-bucket">
                                                    <div className="bucket-header">
                                                        <span className="bucket-title">{label}</span>
                                                        <div className="bucket-actions">
                                                            <button
                                                                className="bucket-action"
                                                                onClick={() => startEdit(key)}
                                                                disabled={isBucketLoading(key)}
                                                            >
                                                                ✎ Edit
                                                            </button>
                                                            <button
                                                                className="bucket-action"
                                                                onClick={() => handleRegenerate(key)}
                                                                disabled={isBucketLoading(key)}
                                                            >
                                                                ↻
                                                            </button>
                                                            {isBucketLoading(key) && <span className="bucket-spinner" />}
                                                        </div>
                                                    </div>
                                                    {editingKey === key ? (
                                                        <textarea
                                                            value={draftValue}
                                                            onChange={(e) => setDraftValue(e.target.value)}
                                                            onBlur={saveEdit}
                                                            autoFocus
                                                            rows={3}
                                                        />
                                                    ) : (
                                                        <div className={`bucket-body${isBucketLoading(key) ? ' is-loading' : ''}`}>
                                                            {typeof structured[key] === 'string' ? structured[key] : '—'}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : null
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {structured?.rawCapture && showRawCapture && (
                            <div className="overview-raw mt-lg">
                                <div className="card mt-md">
                                    <div className="bucket-body">{structured.rawCapture}</div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="prep-actions">
                            <button
                                className="btn btn-secondary project-generate"
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
                        </div>
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
                            <ErrorBoundary title="Tree failed to render" onRetry={retryGeneration}>
                                <TreeEditor
                                    rootNode={project.rootNode}
                                    onChange={handleTreeChange}
                                />
                            </ErrorBoundary>
                        </div>
                    </>
                )}

                {/* Conversation History */}
                {project.callHistory && project.callHistory.length > 0 && (
                    <div className="card mt-lg">
                        <h2 style={{ margin: 0, marginBottom: 'var(--space-md)' }}>
                            💬 Conversation History ({project.callHistory.length})
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
                <div className="prep-cta-inline">
                    <Link
                        href={`/app/project/${project.id}/call`}
                        className="btn btn-primary btn-lg w-full"
                    >
                        Start Conversation Mode
                    </Link>
                </div>
            </main>
            <div className="prep-cta-sticky">
                <Link
                    href={`/app/project/${project.id}/call`}
                    className="btn btn-primary btn-lg w-full"
                >
                    Start Conversation Mode
                </Link>
            </div>
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
