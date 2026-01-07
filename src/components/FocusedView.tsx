'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Project, TreeNode, CallSummary } from '@/lib/types';
import { PanicButton } from './PanicButton';
import { findNodeById, getPathToNode, addChildToNode } from '@/lib/hooks';
import { saveProject } from '@/lib/db';
import { generateCallSummaryAction } from '@/lib/actions';
import { v4 as uuidv4 } from 'uuid';
import { getSentimentClass, getSentimentEmoji } from './NodeCard';
import { getBrowserApiKey } from '@/lib/settings';

interface FocusedViewProps {
    project: Project;
    onProjectUpdate?: (project: Project) => void;
}

export function FocusedView({ project, onProjectUpdate }: FocusedViewProps) {
    const router = useRouter();
    const [currentNodeId, setCurrentNodeId] = useState(project.rootNode.id);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [showFullTree, setShowFullTree] = useState(false);
    const [visitedPath, setVisitedPath] = useState<string[]>([project.rootNode.id]);
    const [showFinishModal, setShowFinishModal] = useState(false);
    const [showMore, setShowMore] = useState(false);
    const [panicActiveId, setPanicActiveId] = useState<string | null>(null);
    const [lastBranchNodeId, setLastBranchNodeId] = useState(project.rootNode.id);

    const currentNode = findNodeById(project.rootNode, currentNodeId) || project.rootNode;
    const path = getPathToNode(project.rootNode, currentNodeId) || [project.rootNode];
    const talkingLines = currentNode.talkingPoints;
    const questionLines = currentNode.questions || [];
    const lastBranchNode = findNodeById(project.rootNode, lastBranchNodeId);
    const effectiveChildren = currentNode.children.length > 0
        ? currentNode.children
        : (lastBranchNode?.children || []);
    const isUsingFallback = currentNode.children.length === 0 && effectiveChildren.length > 0;
    const visibleOptions = effectiveChildren.slice(0, 4);

    useEffect(() => {
        if (currentNode.children.length > 0) {
            setLastBranchNodeId(currentNode.id);
        }
    }, [currentNode]);

    useEffect(() => {
        if (selectedIndex >= effectiveChildren.length) {
            setSelectedIndex(0);
        }
    }, [effectiveChildren.length, selectedIndex]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't handle keys when modal is open
            if (showFinishModal) return;

            // Number keys 1-9 to select option
            if (e.key >= '1' && e.key <= '9') {
                const index = parseInt(e.key) - 1;
                if (index < effectiveChildren.length) {
                    const childId = effectiveChildren[index].id;
                    setCurrentNodeId(childId);
                    setVisitedPath(prev => [...prev, childId]);
                    setSelectedIndex(0);
                }
                return;
            }

            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    setSelectedIndex(prev => Math.max(0, prev - 1));
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    setSelectedIndex(prev => {
                        if (effectiveChildren.length === 0) return 0;
                        return Math.min(effectiveChildren.length - 1, prev + 1);
                    });
                    break;
                case 'Enter':
                    if (effectiveChildren[selectedIndex]) {
                        const childId = effectiveChildren[selectedIndex].id;
                        setCurrentNodeId(childId);
                        setVisitedPath(prev => [...prev, childId]);
                        setSelectedIndex(0);
                    }
                    break;
                case 'Backspace':
                    e.preventDefault();
                    if (path.length > 1) {
                        setCurrentNodeId(path[path.length - 2].id);
                        setSelectedIndex(0);
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
    }, [currentNode, selectedIndex, path, showFullTree, showFinishModal, effectiveChildren]);

    // Handle panic button adding new nodes
    const handlePanicNodes = useCallback(async (newNodes: TreeNode[]) => {
        let updatedRoot = project.rootNode;
        for (const node of newNodes) {
            updatedRoot = addChildToNode(updatedRoot, currentNodeId, node);
        }

        const updatedProject = { ...project, rootNode: updatedRoot };
        await saveProject(updatedProject);
        onProjectUpdate?.(updatedProject);
        if (newNodes[0]) {
            setCurrentNodeId(newNodes[0].id);
            setVisitedPath(prev => [...prev, newNodes[0].id]);
            setSelectedIndex(0);
            setPanicActiveId(newNodes[0].id);
        }
    }, [project, currentNodeId, onProjectUpdate]);

    const navigateToNode = (nodeId: string) => {
        setCurrentNodeId(nodeId);
        setVisitedPath(prev => [...prev, nodeId]);
        setSelectedIndex(0);
    };

    const goBack = () => {
        if (path.length > 1) {
            setCurrentNodeId(path[path.length - 2].id);
            setSelectedIndex(0);
        }
    };

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
                <div className="call-topbar-title">Call Mode</div>
                <div className="call-topbar-actions">
                    <div className="call-cta-panic">
                        <PanicButton
                            currentNode={currentNode}
                            projectContext={project.description}
                            onNewNodes={handlePanicNodes}
                        />
                    </div>
                    <button
                        className="btn btn-primary btn-sm call-cta-finish"
                        onClick={() => setShowFinishModal(true)}
                    >
                        ✓ Finish Call
                    </button>
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
                            <button
                                className="finish-link"
                                onClick={() => setShowFinishModal(true)}
                            >
                                Finish Call
                            </button>
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
                    {questionLines.length > 0 && (
                        <div className="ask-next">
                            <div className="ask-next-label">Ask next</div>
                            <div className="ask-next-list">
                                {questionLines.map((question, i) => (
                                    <div key={i} className="ask-next-line">
                                        {question}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {panicActiveId === currentNodeId && (
                        <div className="panic-followups">
                            {['Clarify', 'Reframe', 'Next step'].map((label) => (
                                <button
                                    key={label}
                                    className="panic-followup-btn"
                                    onClick={async () => {
                                        const followupNode: TreeNode = {
                                            id: uuidv4(),
                                            title: label,
                                            talkingPoints: [],
                                            questions: [],
                                            sentiment: 'neutral',
                                            children: [],
                                        };
                                        const updatedRoot = addChildToNode(project.rootNode, currentNodeId, followupNode);
                                        const updatedProject = { ...project, rootNode: updatedRoot };
                                        await saveProject(updatedProject);
                                        onProjectUpdate?.(updatedProject);
                                        setCurrentNodeId(followupNode.id);
                                        setVisitedPath(prev => [...prev, followupNode.id]);
                                        setSelectedIndex(0);
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

            </main>

            {/* Next moves dock */}
            {effectiveChildren.length > 0 && (
                <section className="options-dock">
                    <div className="options-dock-title">Next moves</div>
                    {isUsingFallback && (
                        <div className="options-fallback-hint">Suggested next</div>
                    )}
                    <div className="options-scroll">
                        {visibleOptions.map((child, index) => (
                            <button
                                key={child.id}
                                className={`next-move-btn ${index === selectedIndex ? 'is-active' : ''}`}
                                onClick={() => navigateToNode(child.id)}
                            >
                                <span className="next-move-title">{child.title}</span>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {/* Floating controls */}
            <div className="floating-controls">
                {path.length > 1 && (
                    <button className="btn btn-secondary call-back-btn" onClick={goBack}>
                        ← Back <span className="kbd" style={{ marginLeft: 4 }}>⌫</span>
                    </button>
                )}
            </div>

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

            {/* Finish Call Modal */}
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
                        router.push(`/project/${project.id}`);
                    }}
                />
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
                    getBrowserApiKey() || undefined
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
                <h2 className="modal-title">📞 Call Summary</h2>

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
                        Call Outcome
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
            {node.children.map(child => (
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
