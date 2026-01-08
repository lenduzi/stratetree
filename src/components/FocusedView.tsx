'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Project, TreeNode, CallSummary, NodeSentiment } from '@/lib/types';
import { PanicButton } from './PanicButton';
import { findNodeById, getPathToNode, addChildToNode, updateNodeInTree } from '@/lib/hooks';
import { saveProject } from '@/lib/db';
import { generateAskNextAction, generateCallSummaryAction, generateNextMovesAction, generateObjectionStep } from '@/lib/actions';
import { v4 as uuidv4 } from 'uuid';
import { getSentimentClass, getSentimentEmoji } from './NodeCard';
import { getBrowserApiKey } from '@/lib/settings';
import { getClientId } from '@/lib/client-id';
import { supabase } from '@/lib/supabase';
import { upsertGuestProject } from '@/lib/guest';

interface FocusedViewProps {
    project: Project;
    onProjectUpdate?: (project: Project) => void;
}

export function FocusedView({ project, onProjectUpdate }: FocusedViewProps) {
    const router = useRouter();
    const [currentNodeId, setCurrentNodeId] = useState(project.rootNode.id);
    const [showFullTree, setShowFullTree] = useState(false);
    const [visitedPath, setVisitedPath] = useState<string[]>([project.rootNode.id]);
    const [showFinishModal, setShowFinishModal] = useState(false);
    const [showMore, setShowMore] = useState(false);
    const [lastMoveLabel, setLastMoveLabel] = useState<string | null>(null);
    const [lastSelectedSentiment, setLastSelectedSentiment] = useState<TreeNode['sentiment'] | null>(null);
    const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
    const [isGeneratingNextMoves, setIsGeneratingNextMoves] = useState(false);
    const [askNextGenerating, setAskNextGenerating] = useState(false);
    const [askNextError, setAskNextError] = useState<string | null>(null);
    const [idleNudge, setIdleNudge] = useState(false);
    const lastGeneratedAtRef = useRef<Record<string, number>>({});
    const lastMovesGeneratedAtRef = useRef<Record<string, number>>({});
    const objectionHintsRef = useRef<Record<string, string>>({});
    const [negativePulse, setNegativePulse] = useState(false);
    const [objectionLoading, setObjectionLoading] = useState(false);
    const [objectionError, setObjectionError] = useState<string | null>(null);
    const [guestPromptOpen, setGuestPromptOpen] = useState(false);

    const currentNode = findNodeById(project.rootNode, currentNodeId) || project.rootNode;
    const childList = Array.isArray(currentNode.children) ? currentNode.children : [];
    const path = getPathToNode(project.rootNode, currentNodeId) || [project.rootNode];
    const talkingLines = Array.isArray(currentNode.talkingPoints) ? currentNode.talkingPoints : [];
    const questionLines = Array.isArray(currentNode.questions) ? currentNode.questions : [];
    const isLowAskNext = questionLines.length < 2;
    const sentimentNudge = lastSelectedSentiment === 'neutral' || lastSelectedSentiment === 'negative';
    const nudgeActive = idleNudge || isLowAskNext || sentimentNudge;
    const sentimentChildren = {
        positive: childList.find((child) => child.sentiment === 'positive') || null,
        neutral: childList.find((child) => child.sentiment === 'neutral') || null,
        negative: childList.find((child) => child.sentiment === 'negative') || null,
    };
    const nextMovesNeeded = !sentimentChildren.positive || !sentimentChildren.neutral || !sentimentChildren.negative;

    useEffect(() => {
        const checkAuth = async () => {
            if (!supabase?.auth) {
                setIsAuthed(false);
                return;
            }
            const { data: { user } } = await supabase.auth.getUser();
            setIsAuthed(!!user);
        };
        checkAuth();
    }, []);

    useEffect(() => {
        setIdleNudge(false);
        const timer = window.setTimeout(() => setIdleNudge(true), 8000);
        return () => window.clearTimeout(timer);
    }, [currentNodeId]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't handle keys when modal is open
            if (showFinishModal) return;

            if (e.key === '1') {
                handleSelectResponse('positive');
                return;
            }
            if (e.key === '2') {
                handleSelectResponse('neutral');
                return;
            }
            if (e.key === '3') {
                handleSelectResponse('negative');
                return;
            }

            switch (e.key) {
                case 'Backspace':
                    e.preventDefault();
                    if (path.length > 1) {
                        setCurrentNodeId(path[path.length - 2].id);
                    }
                    break;
                case 'f':
                case 'F':
                    if (!e.ctrlKey && !e.metaKey) {
                        setShowFullTree(prev => !prev);
                    }
                    break;
                case 'Escape':
                    if (showFullTree) {
                        setShowFullTree(false);
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentNode, path, showFullTree, showFinishModal]);

    const navigateToNode = (nodeId: string) => {
        const node = findNodeById(project.rootNode, nodeId);
        if (node?.title) {
            setLastMoveLabel(node.title);
        }
        setLastSelectedSentiment(node?.sentiment || null);
        setCurrentNodeId(nodeId);
        setVisitedPath(prev => [...prev, nodeId]);
    };

    const goBack = () => {
        if (path.length > 1) {
            setCurrentNodeId(path[path.length - 2].id);
        }
    };

    const handleGenerateNextMoves = useCallback(async () => {
        const now = Date.now();
        const last = lastMovesGeneratedAtRef.current[currentNodeId] || 0;
        if (isGeneratingNextMoves || now - last < 5000) return;
        if (!nextMovesNeeded) return;

        lastMovesGeneratedAtRef.current[currentNodeId] = now;
        setIsGeneratingNextMoves(true);
        try {
            const objectionHint = objectionHintsRef.current[currentNodeId];
            const baseArgs = [
                currentNode,
                project.structured?.goal || project.description,
                project.structured?.router,
                lastMoveLabel || undefined,
                objectionHint || undefined,
                getBrowserApiKey() || undefined,
                getClientId(),
            ] as const;
            let nodes = await generateNextMovesAction(...baseArgs, false);
            if (nodes.length < 2) {
                nodes = await generateNextMovesAction(...baseArgs, true);
            }
            if (nodes.length < 3) {
                nodes = [
                    {
                        id: uuidv4(),
                        title: 'Ask a clarifying question',
                        talkingPoints: ['Can you share more about what’s most important here?'],
                        questions: ['What matters most to you in this situation?'],
                        sentiment: 'neutral',
                        children: [],
                    },
                    {
                        id: uuidv4(),
                        title: 'Summarize and confirm',
                        talkingPoints: ['Let me summarize to make sure I’ve got it right.'],
                        questions: ['Did I capture that correctly?'],
                        sentiment: 'neutral',
                        children: [],
                    },
                    {
                        id: uuidv4(),
                        title: 'Propose next step',
                        talkingPoints: ['Here’s a simple next step we can take.'],
                        questions: ['Would that work for you?'],
                        sentiment: 'positive',
                        children: [],
                    },
                ] satisfies TreeNode[];
            }
            let updatedRoot = project.rootNode;
            nodes.forEach((node) => {
                updatedRoot = addChildToNode(updatedRoot, currentNodeId, node);
            });
            const updatedProject = { ...project, rootNode: updatedRoot };
            await saveProject(updatedProject);
            onProjectUpdate?.(updatedProject);
        } catch (e) {
            console.warn('Failed to generate next moves', e);
            const fallbackNodes = [
                {
                    id: uuidv4(),
                    title: 'Ask a clarifying question',
                    talkingPoints: ['Can you share more about what’s most important here?'],
                    questions: ['What matters most to you in this situation?'],
                    sentiment: 'neutral',
                    children: [],
                },
                {
                    id: uuidv4(),
                    title: 'Summarize and confirm',
                    talkingPoints: ['Let me summarize to make sure I’ve got it right.'],
                    questions: ['Did I capture that correctly?'],
                    sentiment: 'neutral',
                    children: [],
                },
                {
                    id: uuidv4(),
                    title: 'Propose next step',
                    talkingPoints: ['Here’s a simple next step we can take.'],
                    questions: ['Would that work for you?'],
                    sentiment: 'positive',
                    children: [],
                },
            ] satisfies TreeNode[];
            let updatedRoot = project.rootNode;
            fallbackNodes.forEach((node) => {
                updatedRoot = addChildToNode(updatedRoot, currentNodeId, node);
            });
            const updatedProject = { ...project, rootNode: updatedRoot };
            await saveProject(updatedProject);
            onProjectUpdate?.(updatedProject);
        } finally {
            setIsGeneratingNextMoves(false);
        }
    }, [
        currentNode,
        currentNodeId,
        isGeneratingNextMoves,
        nextMovesNeeded,
        project,
        lastMoveLabel,
        onProjectUpdate,
    ]);

    useEffect(() => {
        if (nextMovesNeeded) {
            handleGenerateNextMoves();
        }
    }, [nextMovesNeeded, handleGenerateNextMoves]);

    const [pendingSentiment, setPendingSentiment] = useState<NodeSentiment | null>(null);

    useEffect(() => {
        if (!pendingSentiment) return;
        const child = sentimentChildren[pendingSentiment];
        if (child) {
            setPendingSentiment(null);
            navigateToNode(child.id);
        }
    }, [pendingSentiment, sentimentChildren, navigateToNode]);

    const handleSelectResponse = (sentiment: NodeSentiment) => {
        const child = sentimentChildren[sentiment];
        if (child) {
            navigateToNode(child.id);
        } else {
            setPendingSentiment(sentiment);
            handleGenerateNextMoves();
        }
    };

    const fallbackObjections = [
        'Denial / disagreement on facts',
        'Defensive / blame shifting',
        'Emotional overwhelm',
        'Avoidance / delay',
        'Trust / credibility',
        'Different priorities',
    ];
    const rawObjections = project.structured?.objections || [];
    const objectionsFallback = project.structured?.objectionsFallback || rawObjections.length === 0;
    const objectionLabels = rawObjections.length > 0 ? rawObjections : fallbackObjections;

    const handlePanicSelect = async (label: string) => {
        const isOther = label === 'Other...';
        const selectedLabel = isOther ? window.prompt('What are they resisting?') : label;
        if (!selectedLabel) return;

        setObjectionError(null);
        setObjectionLoading(true);
        const t0 = Date.now();
        try {
            const contextSummary = [
                project.structured?.goal,
                project.structured?.stakeholder,
                project.structured?.context,
                project.structured?.decisionFrame,
            ].filter(Boolean).join(' | ');
            const step = await generateObjectionStep(
                selectedLabel,
                contextSummary || project.description,
                getBrowserApiKey() || undefined,
                getClientId()
            );
            console.log('[panic] objection_ms', Date.now() - t0);
            const existingNegative = sentimentChildren.negative;
            const targetId = existingNegative?.id || uuidv4();
            const updatedNegative: TreeNode = {
                id: targetId,
                title: step.title,
                talkingPoints: step.sayThisNow || [],
                questions: step.askNext || [],
                sentiment: 'negative',
                children: existingNegative?.children || [],
            };
            let updatedRoot = project.rootNode;
            if (existingNegative) {
                updatedRoot = updateNodeInTree(updatedRoot, existingNegative.id, () => updatedNegative);
            } else {
                updatedRoot = addChildToNode(updatedRoot, currentNodeId, updatedNegative);
            }
            objectionHintsRef.current[targetId] = selectedLabel;
            const updatedProject = { ...project, rootNode: updatedRoot };
            await saveProject(updatedProject);
            onProjectUpdate?.(updatedProject);
            setNegativePulse(true);
            window.setTimeout(() => setNegativePulse(false), 800);
            navigateToNode(targetId);
        } catch (e) {
            console.warn('Failed to generate objection step', e);
            setObjectionError('Couldn’t generate objection help — try again');
        } finally {
            setObjectionLoading(false);
        }
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

    const handleAskNextAutogen = useCallback(async () => {
        const now = Date.now();
        const last = lastGeneratedAtRef.current[currentNodeId] || 0;
        if (askNextGenerating || now - last < 5000) return;
        if (questionLines.length >= 2) return;

        lastGeneratedAtRef.current[currentNodeId] = now;
        setAskNextGenerating(true);
        setAskNextError(null);
        try {
            const questions = await generateAskNextAction(
                currentNode,
                project.structured?.goal || project.description,
                project.structured?.router,
                lastMoveLabel || undefined,
                getBrowserApiKey() || undefined,
                getClientId()
            );
            if (questions.length === 0) {
                throw new Error('No questions generated');
            }
            const updatedRoot = updateNodeInTree(project.rootNode, currentNodeId, (node) => ({
                ...node,
                questions,
            }));
            const updatedProject = { ...project, rootNode: updatedRoot };
            await saveProject(updatedProject);
            onProjectUpdate?.(updatedProject);
        } catch (e) {
            setAskNextError(e instanceof Error ? e.message : 'Failed to generate questions');
        } finally {
            setAskNextGenerating(false);
        }
    }, [
        askNextGenerating,
        currentNode,
        currentNodeId,
        lastGeneratedAtRef,
        lastMoveLabel,
        project,
        questionLines.length,
        onProjectUpdate,
    ]);

    useEffect(() => {
        if (questionLines.length < 2) {
            handleAskNextAutogen();
        }
    }, [handleAskNextAutogen, questionLines.length]);

    // Get visited path as titles
    const getVisitedTitles = () => {
        return visitedPath
            .map(id => findNodeById(project.rootNode, id)?.title)
            .filter((t): t is string => !!t);
    };

    return (
        <div className="focused-view call-mode">
            {/* Header with breadcrumb */}
            <header className="header call-topbar">
                <div className="call-topbar-title">
                    <span className="call-title-primary">
                        {project.name?.split('—')[0]?.trim() || project.name || 'Conversation'}
                    </span>
                </div>
                <div className="call-topbar-actions">
                    {path.length > 1 && (
                        <button className="btn btn-secondary btn-sm call-back-btn" onClick={goBack}>
                            ← Back
                        </button>
                    )}
                    <div className="call-cta-panic">
                        <PanicButton
                            nudgeActive={nudgeActive}
                            objections={objectionLabels}
                            fallbackObjections={objectionsFallback}
                            onSelect={handlePanicSelect}
                        />
                    </div>
                </div>
            </header>

            {/* Main content */}
            <main className="focused-content">
                {/* Current node - what to say now */}
                <div className={`current-node say-now-card ${getSentimentClass(currentNode.sentiment)}`}>
                    <div className="say-now-header">
                        <span className="say-now-label">Say this now</span>
                        <div className="say-now-actions">
                            {talkingLines.length > 2 && (
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setShowMore((prev) => !prev)}
                                >
                                    {showMore ? 'Less' : 'More'}
                                </button>
                            )}
                        </div>
                    </div>
                    <h1 className="current-node-title">
                        {currentNode.sentiment && <span style={{ marginRight: 8 }}>{getSentimentEmoji(currentNode.sentiment)}</span>}
                        {currentNode.title}
                    </h1>
                    {talkingLines.length > 0 && (
                        <div className={`say-now-brief ${showMore ? 'expanded' : ''}`}>
                            {(showMore ? talkingLines : talkingLines.slice(0, 2)).map((line, i) => (
                                <div key={i} className="say-now-line">
                                    {line}
                                </div>
                            ))}
                        </div>
                    )}
                    {objectionLoading && (
                        <div className="objection-loading">
                            <div className="spinner" style={{ width: 18, height: 18 }} />
                            <span>Thinking…</span>
                        </div>
                    )}
                    {objectionError && (
                        <div className="objection-error">
                            {objectionError}
                        </div>
                    )}
                    <div className="ask-next">
                        <div className="ask-next-label">Ask next</div>
                        <div className="ask-next-list">
                            {askNextGenerating ? (
                                <>
                                    <div className="ask-next-skeleton" />
                                    <div className="ask-next-skeleton short" />
                                </>
                            ) : questionLines.length > 0 ? (
                                questionLines.map((question, i) => (
                                    <div key={i} className="ask-next-line">
                                        {question}
                                    </div>
                                ))
                            ) : (
                                <div className="ask-next-empty">Generating questions…</div>
                            )}
                        </div>
                        {askNextError && !askNextGenerating && (
                            <button className="btn btn-secondary btn-sm" onClick={handleAskNextAutogen}>
                                Generate options
                            </button>
                        )}
                    </div>
                </div>

            </main>

            {/* Next moves dock */}
            <section className="options-dock">
                <div className="finish-pill-row">
                    <button
                        className="finish-pill"
                        onClick={() => setShowFinishModal(true)}
                    >
                        Finish conversation
                    </button>
                </div>
                <div className="options-dock-title">THEIR RESPONSE</div>
                <div className="response-chips">
                    {(['positive', 'neutral', 'negative'] as NodeSentiment[]).map((sentiment) => (
                        <button
                            key={sentiment}
                            className={`response-chip response-${sentiment}${pendingSentiment === sentiment ? ' is-loading' : ''}${negativePulse && sentiment === 'negative' ? ' pulse' : ''}`}
                            onClick={() => handleSelectResponse(sentiment)}
                            disabled={isGeneratingNextMoves && pendingSentiment === sentiment}
                        >
                            {sentiment === 'positive' ? 'Positive' : sentiment === 'neutral' ? 'Neutral' : 'Negative'}
                        </button>
                    ))}
                </div>
            </section>

            {/* Full tree modal */}
            {showFullTree && (
                <div className="modal-overlay" onClick={() => setShowFullTree(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
                        <h2 className="modal-title">Full Tree View</h2>
                        <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
                            <TreePreview
                                node={project.rootNode}
                                currentNodeId={currentNodeId}
                                onSelect={(id) => {
                                    navigateToNode(id);
                                    setShowFullTree(false);
                                }}
                            />
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setShowFullTree(false)}>
                                Close <span className="kbd">Esc</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Finish Conversation Modal */}
            {showFinishModal && (
                <FinishCallModal
                    projectId={project.id}
                    projectDescription={project.description}
                    pathTitles={getVisitedTitles()}
                    pathIds={visitedPath}
                    onClose={() => setShowFinishModal(false)}
                    onSave={async (summary) => {
                        const updatedProject = {
                            ...project,
                            callHistory: [...(project.callHistory || []), summary],
                        };
                        await saveProject(updatedProject);
                        onProjectUpdate?.(updatedProject);
                        setShowFinishModal(false);
                        if (isAuthed) {
                            router.push('/app');
                            return;
                        }
                        upsertGuestProject(updatedProject);
                        if (typeof window !== 'undefined') {
                            localStorage.setItem('yapmap-pending-summary', JSON.stringify({
                                projectId: project.id,
                                summaryId: summary.id,
                            }));
                        }
                        setGuestPromptOpen(true);
                    }}
                />
            )}

            {guestPromptOpen && (
                <div className="modal-overlay" onClick={() => {
                    setGuestPromptOpen(false);
                    router.push('/app');
                }}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">Save & sync your YapMap</h2>
                        <p className="text-muted">Signing up is completely free. Keep this YapMap and unlock unlimited maps + sync.</p>
                        <div className="guest-auth-actions">
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
                            <button className="btn btn-secondary w-full" onClick={() => router.push('/login?redirect=/app')}>
                                Continue with email
                            </button>
                            <div className="login-divider">
                                <span>or continue as guest</span>
                            </div>
                            <button className="btn btn-secondary w-full" onClick={() => {
                                setGuestPromptOpen(false);
                                router.push('/app');
                            }}>
                                Continue as guest
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Finish Call Modal Component
function FinishCallModal({
    projectId,
    projectDescription,
    pathTitles,
    pathIds,
    onClose,
    onSave,
}: {
    projectId: string;
    projectDescription: string;
    pathTitles: string[];
    pathIds: string[];
    onClose: () => void;
    onSave: (summary: CallSummary) => void;
}) {
    const [aiSummary, setAiSummary] = useState('');
    const [userNotes, setUserNotes] = useState('');
    const [outcome, setOutcome] = useState<CallSummary['outcome']>('followup');
    const [generating, setGenerating] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Generate AI summary on mount
    useEffect(() => {
        const generate = async () => {
            try {
                const summary = await generateCallSummaryAction(
                    pathTitles,
                    projectDescription,
                    getBrowserApiKey() || undefined,
                    getClientId()
                );
                setAiSummary(summary);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to generate summary');
                setAiSummary('(Could not generate AI summary)');
            } finally {
                setGenerating(false);
            }
        };
        generate();
    }, [pathTitles, projectDescription]);

    const handleSave = () => {
        const summary: CallSummary = {
            id: uuidv4(),
            timestamp: Date.now(),
            pathTaken: pathIds,
            pathTitles,
            aiSummary,
            userNotes,
            outcome,
        };
        onSave(summary);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
                <h2 className="modal-title">💬 Conversation Summary</h2>

                {/* Path taken */}
                <div style={{ marginBottom: 'var(--space-lg)' }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: '0.9rem' }}>
                        Path Taken
                    </label>
                    <div style={{
                        padding: 'var(--space-sm)',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)'
                    }}>
                        {pathTitles.join(' → ')}
                    </div>
                </div>

                {/* AI Summary */}
                <div style={{ marginBottom: 'var(--space-lg)' }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: '0.9rem' }}>
                        AI Summary
                    </label>
                    {generating ? (
                        <div className="flex items-center gap-sm" style={{ padding: 'var(--space-md)' }}>
                            <div className="spinner" style={{ width: 16, height: 16 }} />
                            <span className="text-muted">Generating summary...</span>
                        </div>
                    ) : (
                        <textarea
                            value={aiSummary}
                            onChange={(e) => setAiSummary(e.target.value)}
                            rows={4}
                            style={{ fontSize: '0.9rem' }}
                        />
                    )}
                    {error && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: 4 }}>{error}</div>}
                </div>

                {/* User Notes */}
                <div style={{ marginBottom: 'var(--space-lg)' }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: '0.9rem' }}>
                        Your Notes
                    </label>
                    <textarea
                        value={userNotes}
                        onChange={(e) => setUserNotes(e.target.value)}
                        placeholder="Add your own observations, action items, or follow-up notes..."
                        rows={3}
                        style={{ fontSize: '0.9rem' }}
                    />
                </div>

                {/* Outcome */}
                <div style={{ marginBottom: 'var(--space-lg)' }}>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: '0.9rem' }}>
                        Conversation Outcome
                    </label>
                    <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                        {[
                            { value: 'success', label: '✅ Success', color: 'var(--success)' },
                            { value: 'followup', label: '📅 Follow-up', color: 'var(--warning)' },
                            { value: 'lost', label: '❌ Lost', color: 'var(--danger)' },
                            { value: 'other', label: '📝 Other', color: 'var(--text-muted)' },
                        ].map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => setOutcome(opt.value as CallSummary['outcome'])}
                                className="btn btn-sm"
                                style={{
                                    background: outcome === opt.value ? opt.color : 'var(--bg-tertiary)',
                                    color: outcome === opt.value ? 'white' : 'var(--text-primary)',
                                    border: 'none',
                                }}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={generating}>
                        Save Summary
                    </button>
                </div>
            </div>
        </div>
    );
}

// Simple tree preview for the full tree modal
function TreePreview({
    node,
    currentNodeId,
    onSelect,
    depth = 0
}: {
    node: TreeNode;
    currentNodeId: string;
    onSelect: (id: string) => void;
    depth?: number;
}) {
    const isActive = node.id === currentNodeId;

    return (
        <div style={{ marginLeft: depth * 16 }}>
            <button
                onClick={() => onSelect(node.id)}
                style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 12px',
                    marginBottom: 4,
                    background: isActive ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    color: isActive ? 'white' : 'var(--text-primary)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                }}
            >
                {node.title}
            </button>
            {(Array.isArray(node.children) ? node.children : []).map(child => (
                <TreePreview
                    key={child.id}
                    node={child}
                    currentNodeId={currentNodeId}
                    onSelect={onSelect}
                    depth={depth + 1}
                />
            ))}
        </div>
    );
}
