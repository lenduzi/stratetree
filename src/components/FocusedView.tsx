'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Project, TreeNode, CallSummary } from '@/lib/types';
import { NodeCard } from './NodeCard';
import { Breadcrumb } from './Breadcrumb';
import { PanicButton } from './PanicButton';
import { findNodeById, getPathToNode, addChildToNode } from '@/lib/hooks';
import { saveProject } from '@/lib/db';
import { generateCallSummaryAction } from '@/lib/actions';
import { v4 as uuidv4 } from 'uuid';
import { ThemeToggle } from './ThemeProvider';
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

    const currentNode = findNodeById(project.rootNode, currentNodeId) || project.rootNode;
    const path = getPathToNode(project.rootNode, currentNodeId) || [project.rootNode];

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't handle keys when modal is open
            if (showFinishModal) return;

            // Number keys 1-9 to select option
            if (e.key >= '1' && e.key <= '9') {
                const index = parseInt(e.key) - 1;
                if (index < currentNode.children.length) {
                    const childId = currentNode.children[index].id;
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
                    setSelectedIndex(prev => Math.min(currentNode.children.length - 1, prev + 1));
                    break;
                case 'Enter':
                    if (currentNode.children[selectedIndex]) {
                        const childId = currentNode.children[selectedIndex].id;
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
    }, [currentNode, selectedIndex, path, showFullTree, showFinishModal]);

    // Handle panic button adding new nodes
    const handlePanicNodes = useCallback(async (newNodes: TreeNode[]) => {
        let updatedRoot = project.rootNode;
        for (const node of newNodes) {
            updatedRoot = addChildToNode(updatedRoot, currentNodeId, node);
        }

        const updatedProject = { ...project, rootNode: updatedRoot };
        await saveProject(updatedProject);
        onProjectUpdate?.(updatedProject);
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
        <div className="focused-view">
            {/* Header with breadcrumb */}
            <header className="header">
                <div className="flex items-center gap-md">
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => router.push(`/project/${project.id}`)}
                    >
                        ← Edit
                    </button>
                    <Breadcrumb
                        path={path}
                        projectId={project.id}
                        onNavigate={navigateToNode}
                    />
                </div>
                <div className="flex items-center gap-sm">
                    <ThemeToggle />
                    <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                        <span className="kbd">F</span> Full tree
                    </span>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setShowFinishModal(true)}
                    >
                        ✓ Finish Call
                    </button>
                </div>
            </header>

            {/* Main content */}
            <main className="focused-content">
                {/* Current node - what to say now */}
                <div className={`current-node ${getSentimentClass(currentNode.sentiment)}`}>
                    <h1 className="current-node-title">
                        {currentNode.sentiment && <span style={{ marginRight: 8 }}>{getSentimentEmoji(currentNode.sentiment)}</span>}
                        {currentNode.title}
                    </h1>

                    {/* Talking Points */}
                    {currentNode.talkingPoints.length > 0 && (
                        <div className="talking-points">
                            {currentNode.talkingPoints.map((point, i) => (
                                <div key={i} className="talking-point">
                                    <span className="talking-point-bullet">•</span>
                                    <span>{point}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Discovery Questions */}
                    {currentNode.questions && currentNode.questions.length > 0 && (
                        <div className="questions-section" style={{ marginTop: 'var(--space-lg)' }}>
                            <h3 style={{
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                color: 'var(--accent-secondary)',
                                marginBottom: 'var(--space-sm)'
                            }}>
                                🎯 Ask the Client
                            </h3>
                            <div className="talking-points">
                                {currentNode.questions.map((question, i) => (
                                    <div key={i} className="talking-point" style={{
                                        background: 'rgba(99, 102, 241, 0.15)',
                                        borderLeft: '3px solid var(--accent-primary)'
                                    }}>
                                        <span style={{ color: 'var(--accent-secondary)', fontWeight: 600 }}>?</span>
                                        <span style={{ fontStyle: 'italic' }}>{question}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Child options - where to go next */}
                {currentNode.children.length > 0 && (
                    <section className="options-section">
                        <h2 className="options-title">
                            Where is the conversation going?
                            <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none' }}>
                                (use <span className="kbd">↑</span><span className="kbd">↓</span> or <span className="kbd">1</span>-<span className="kbd">9</span>)
                            </span>
                        </h2>
                        <div className="options-list">
                            {currentNode.children.map((child, index) => (
                                <NodeCard
                                    key={child.id}
                                    node={child}
                                    index={index}
                                    isActive={index === selectedIndex}
                                    onClick={() => navigateToNode(child.id)}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {/* No children - end of path */}
                {currentNode.children.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-state-icon">🎯</div>
                        <div className="empty-state-title">End of path</div>
                        <p>No more branches from here. Use Panic button if something unexpected comes up, or Finish Call when done.</p>
                    </div>
                )}
            </main>

            {/* Floating controls */}
            <div className="floating-controls">
                {path.length > 1 && (
                    <button className="btn btn-secondary" onClick={goBack}>
                        ← Back <span className="kbd" style={{ marginLeft: 4 }}>⌫</span>
                    </button>
                )}
                <PanicButton
                    currentNode={currentNode}
                    projectContext={project.description}
                    onNewNodes={handlePanicNodes}
                />
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
