'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Project, TreeNode, CallSummary, NodeSentiment, ObjectionBundle } from '@/lib/types';
import { PanicButton } from './PanicButton';
import { addChildToNode, updateNodeInTree } from '@/lib/hooks';
import { saveProject } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { getSentimentClass, getSentimentEmoji } from './NodeCard';
import { supabase } from '@/lib/supabase';
import { upsertGuestProject } from '@/lib/guest';

interface FocusedViewProps {
    project: Project;
    onProjectUpdate?: (project: Project) => void;
}

type NodeIndex = {
    nodeMap: Map<string, TreeNode>;
    parentMap: Map<string, string | null>;
};

function buildNodeIndex(root: TreeNode): NodeIndex {
    const nodeMap = new Map<string, TreeNode>();
    const parentMap = new Map<string, string | null>();
    const walk = (node: TreeNode, parentId: string | null) => {
        nodeMap.set(node.id, node);
        parentMap.set(node.id, parentId);
        node.children.forEach((child) => walk(child, node.id));
    };
    walk(root, null);
    return { nodeMap, parentMap };
}

export function FocusedView({ project, onProjectUpdate }: FocusedViewProps) {
    const router = useRouter();
    const [currentNodeId, setCurrentNodeId] = useState(project.rootNode.id);
    const [showFullTree, setShowFullTree] = useState(false);
    const [visitedPath, setVisitedPath] = useState<string[]>([project.rootNode.id]);
    const [showFinishModal, setShowFinishModal] = useState(false);
    const [showMore, setShowMore] = useState(false);
    const [lastSelectedSentiment, setLastSelectedSentiment] = useState<TreeNode['sentiment'] | null>(null);
    const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
    const [idleNudge, setIdleNudge] = useState(false);
    const [negativePulse, setNegativePulse] = useState(false);
    const [guestPromptOpen, setGuestPromptOpen] = useState(false);
    const [activePanel, setActivePanel] = useState<'question' | 'soft' | 'direct' | 'next' | null>(null);
    const [secondaryReveal, setSecondaryReveal] = useState<'proof' | 'risk' | 'challenger' | null>(null);
    const [emotion, setEmotion] = useState<'neutral' | 'annoyed' | 'skeptical' | 'cold'>('neutral');
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const touchStartX = useRef<number | null>(null);

    const nodeIndex = useMemo(() => buildNodeIndex(project.rootNode), [project.rootNode]);
    const currentNode = nodeIndex.nodeMap.get(currentNodeId) || project.rootNode;
    const childList = Array.isArray(currentNode.children) ? currentNode.children : [];
    const path = useMemo(() => {
        const nodes: TreeNode[] = [];
        let cursor: string | null = currentNodeId;
        while (cursor) {
            const node = nodeIndex.nodeMap.get(cursor);
            if (node) nodes.unshift(node);
            cursor = nodeIndex.parentMap.get(cursor) || null;
        }
        return nodes.length > 0 ? nodes : [project.rootNode];
    }, [currentNodeId, nodeIndex, project.rootNode]);
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
    const isObjectionNode = currentNode.type === 'objection' || !!currentNode.objectionBundle;

    const baseBundle: ObjectionBundle | undefined = currentNode.objectionBundle;
    const emotionVariant = baseBundle?.emotionVariants?.[emotion];
    const mergedBundle = baseBundle
        ? {
            ...baseBundle,
            ...emotionVariant,
            responses: {
                ...baseBundle.responses,
                ...emotionVariant?.responses,
            },
        }
        : undefined;

    const allObjectionNodes = useMemo(() => {
        const results: TreeNode[] = [];
        nodeIndex.nodeMap.forEach((node) => {
            if (node.type === 'objection' || node.objectionBundle) {
                results.push(node);
            }
        });
        return results;
    }, [nodeIndex]);

    const allTags = Array.from(new Set(allObjectionNodes.flatMap((node) => node.objectionBundle?.tags || []))).filter(Boolean);
    const filteredObjections = allObjectionNodes.filter((node) => {
        const titleMatch = node.title.toLowerCase().includes(searchQuery.toLowerCase());
        const tags = node.objectionBundle?.tags || [];
        const tagMatch = activeTag ? tags.includes(activeTag) : true;
        const queryMatch = searchQuery ? titleMatch || tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase())) : true;
        return tagMatch && queryMatch;
    }).slice(0, 6);

    useEffect(() => {
        const checkAuth = async () => {
            if (!supabase?.auth) {
                setIsAuthed(false);
                return;
            }
            const { data: { session } } = await supabase.auth.getSession();
            setIsAuthed(!!session?.user);
        };
        checkAuth();
    }, []);

    useEffect(() => {
        setIdleNudge(false);
        const timer = window.setTimeout(() => setIdleNudge(true), 8000);
        return () => window.clearTimeout(timer);
    }, [currentNodeId]);

    useEffect(() => {
        setActivePanel(null);
        setSecondaryReveal(null);
        setShowMore(false);
    }, [currentNodeId]);

    useEffect(() => {
        if (process.env.NODE_ENV !== 'development') return;
        const start = performance.now();
        console.log('[call] open_ms', Math.round(start));
        return () => {
            const end = performance.now();
            console.log('[call] close_ms', Math.round(end - start));
        };
    }, []);

    useEffect(() => {
        if (process.env.NODE_ENV !== 'development') return;
        const t0 = performance.now();
        requestAnimationFrame(() => {
            const t1 = performance.now();
            console.log('[call] switch_ms', Math.round(t1 - t0));
        });
    }, [currentNodeId]);

    const navigateSibling = (direction: -1 | 1) => {
        if (path.length < 2) return;
        const parent = path[path.length - 2];
        const siblings = parent.children || [];
        const index = siblings.findIndex((node) => node.id === currentNodeId);
        if (index === -1) return;
        const nextIndex = index + direction;
        const target = siblings[nextIndex];
        if (target) {
            navigateToNode(target.id);
        }
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't handle keys when modal is open
            if (showFinishModal) return;

            if (isObjectionNode) {
                if (e.key === '1') setActivePanel('question');
                if (e.key === '2') setActivePanel('soft');
                if (e.key === '3') setActivePanel('direct');
                if (e.key === '4') setActivePanel('next');
            } else {
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
                case 'ArrowLeft':
                    navigateSibling(-1);
                    break;
                case 'ArrowRight':
                    navigateSibling(1);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentNode, path, showFullTree, showFinishModal, isObjectionNode]);

    const navigateToNode = (nodeId: string) => {
        const node = nodeIndex.nodeMap.get(nodeId);
        setLastSelectedSentiment(node?.sentiment || null);
        setCurrentNodeId(nodeId);
        setVisitedPath(prev => [...prev, nodeId]);
    };

    const goBack = () => {
        if (path.length > 1) {
            setCurrentNodeId(path[path.length - 2].id);
        }
    };

    const ensureFallbackChildren = () => {
        if (!nextMovesNeeded) return;
        const fallbackNodes: TreeNode[] = [
            {
                id: uuidv4(),
                title: 'Positive response',
                talkingPoints: ['Acknowledge the alignment and move forward.'],
                questions: ['What would make this a clear yes?'],
                sentiment: 'positive',
                children: [],
            },
            {
                id: uuidv4(),
                title: 'Neutral response',
                talkingPoints: ['Stay curious and keep momentum.'],
                questions: ['What would you want to see next?'],
                sentiment: 'neutral',
                children: [],
            },
            {
                id: uuidv4(),
                title: 'Pushback',
                talkingPoints: ['Acknowledge concerns and invite specifics.'],
                questions: ['What’s the biggest concern right now?'],
                sentiment: 'negative',
                children: [],
            },
        ];
        let updatedRoot = project.rootNode;
        fallbackNodes.forEach((node) => {
            if (!childList.find((child) => child.sentiment === node.sentiment)) {
                updatedRoot = addChildToNode(updatedRoot, currentNodeId, node);
            }
        });
        const updatedProject = { ...project, rootNode: updatedRoot };
        saveProject(updatedProject, false);
        onProjectUpdate?.(updatedProject);
    };

    const handleSelectResponse = (sentiment: NodeSentiment) => {
        const child = sentimentChildren[sentiment];
        if (child) {
            navigateToNode(child.id);
        } else {
            ensureFallbackChildren();
            const updatedChild = nodeIndex.nodeMap.get(currentNodeId)?.children?.find((node) => node.sentiment === sentiment);
            if (updatedChild) {
                navigateToNode(updatedChild.id);
            }
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
        const handler = project.structured?.objectionHandlers?.[selectedLabel];
        const handlerNode: TreeNode = handler
            ? {
                ...handler,
                type: handler.type || 'objection',
                talkingPoints: handler.objectionBundle?.primaryLine
                    ? [handler.objectionBundle.primaryLine]
                    : handler.talkingPoints,
                questions: handler.objectionBundle?.diagnoseQuestion
                    ? [handler.objectionBundle.diagnoseQuestion]
                    : handler.questions,
            }
            : {
                id: uuidv4(),
                title: `Handle: ${selectedLabel}`,
                sentiment: 'negative',
                type: 'objection',
                talkingPoints: ['Acknowledge the concern and clarify specifics.'],
                questions: ['What’s the biggest concern here?'],
                children: [],
            };
        const existingNegative = sentimentChildren.negative;
        const targetId = existingNegative?.id || uuidv4();
        const updatedNegative: TreeNode = {
            ...handlerNode,
            id: targetId,
            sentiment: 'negative',
            children: existingNegative?.children || handlerNode.children || [],
        };
        let updatedRoot = project.rootNode;
        if (existingNegative) {
            updatedRoot = updateNodeInTree(updatedRoot, existingNegative.id, () => updatedNegative);
        } else {
            updatedRoot = addChildToNode(updatedRoot, currentNodeId, updatedNegative);
        }
        const updatedProject = { ...project, rootNode: updatedRoot };
        await saveProject(updatedProject, false);
        onProjectUpdate?.(updatedProject);
        setNegativePulse(true);
        window.setTimeout(() => setNegativePulse(false), 800);
        navigateToNode(targetId);
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

    

    // Get visited path as titles
    const getVisitedTitles = () => {
        return visitedPath
            .map(id => nodeIndex.nodeMap.get(id)?.title)
            .filter((t): t is string => !!t);
    };

    const primaryLine = mergedBundle?.primaryLine || talkingLines[0] || ' ';
    const questionLine = mergedBundle?.diagnoseQuestion || questionLines[0] || '';
    const softLine = mergedBundle?.responses?.soft || '';
    const directLine = mergedBundle?.responses?.direct || '';
    const challengerLine = mergedBundle?.responses?.challenger || '';
    const nextStepLine = mergedBundle?.nextStep || '';
    const proofLine = mergedBundle?.proof || '';
    const riskLine = mergedBundle?.riskReset || '';

    const activePanelContent = (() => {
        switch (activePanel) {
            case 'question':
                return questionLine;
            case 'soft':
                return softLine;
            case 'direct':
                return directLine;
            case 'next':
                return nextStepLine;
            default:
                return '';
        }
    })();

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
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowSearch((prev) => !prev)}>
                        {showSearch ? 'Hide' : 'Find'}
                    </button>
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
            <main
                className="focused-content"
                onTouchStart={(e) => {
                    touchStartX.current = e.touches[0]?.clientX ?? null;
                }}
                onTouchEnd={(e) => {
                    if (touchStartX.current == null) return;
                    const endX = e.changedTouches[0]?.clientX ?? 0;
                    const delta = endX - touchStartX.current;
                    if (Math.abs(delta) > 60) {
                        navigateSibling(delta > 0 ? -1 : 1);
                    }
                    touchStartX.current = null;
                }}
            >
                {showSearch && (
                    <div className="call-search-panel">
                        <input
                            className="call-search-input"
                            placeholder="Search objections"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <div className="call-tag-row">
                            {allTags.map((tag) => (
                                <button
                                    key={tag}
                                    className={`tag-chip ${activeTag === tag ? 'active' : ''}`}
                                    onClick={() => setActiveTag((prev) => (prev === tag ? null : tag))}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                        <div className="call-search-results">
                            {filteredObjections.map((node) => (
                                <button
                                    key={node.id}
                                    className="call-search-item"
                                    onClick={() => {
                                        navigateToNode(node.id);
                                        setShowSearch(false);
                                    }}
                                >
                                    {node.title}
                                </button>
                            ))}
                            {filteredObjections.length === 0 && (
                                <div className="call-search-empty">No matches.</div>
                            )}
                        </div>
                    </div>
                )}

                {isObjectionNode ? (
                    <div className="objection-card">
                        <div className="objection-header">
                            <span className="say-now-label">Objection</span>
                            <h1 className="current-node-title">{currentNode.title}</h1>
                        </div>
                        <div className="objection-primary">{primaryLine}</div>
                        <div className="objection-actions">
                            <button className="btn btn-primary" onClick={() => setActivePanel('question')}>
                                Question
                            </button>
                            <button className="btn btn-secondary" onClick={() => setActivePanel('soft')}>
                                Answer: Soft
                            </button>
                            <button className="btn btn-secondary" onClick={() => setActivePanel('direct')}>
                                Answer: Direct
                            </button>
                            <button className="btn btn-secondary" onClick={() => setActivePanel('next')}>
                                Next Step
                            </button>
                        </div>
                        {activePanelContent && (
                            <div className="objection-panel">
                                {activePanelContent}
                            </div>
                        )}
                        <div className="objection-secondary">
                            {proofLine && (
                                <button className="tag-chip" onClick={() => setSecondaryReveal('proof')}>
                                    Proof
                                </button>
                            )}
                            {riskLine && (
                                <button className="tag-chip" onClick={() => setSecondaryReveal('risk')}>
                                    Risk
                                </button>
                            )}
                            {challengerLine && (
                                <button className="tag-chip" onClick={() => setSecondaryReveal('challenger')}>
                                    Challenger
                                </button>
                            )}
                            <button className="tag-chip" onClick={goBack}>
                                Exit
                            </button>
                        </div>
                        {secondaryReveal === 'proof' && proofLine && (
                            <div className="objection-panel secondary">{proofLine}</div>
                        )}
                        {secondaryReveal === 'risk' && riskLine && (
                            <div className="objection-panel secondary">{riskLine}</div>
                        )}
                        {secondaryReveal === 'challenger' && challengerLine && (
                            <div className="objection-panel secondary">{challengerLine}</div>
                        )}
                        {baseBundle?.emotionVariants && (
                            <div className="emotion-toggle">
                                {([
                                    { key: 'neutral', label: '😐' },
                                    { key: 'annoyed', label: '😠' },
                                    { key: 'skeptical', label: '🤨' },
                                    { key: 'cold', label: '🧊' },
                                ] as const).map((item) => (
                                    <button
                                        key={item.key}
                                        className={`emotion-chip ${emotion === item.key ? 'active' : ''}`}
                                        onClick={() => setEmotion(item.key)}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
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
                        <div className="ask-next">
                            <div className="ask-next-label">Ask next</div>
                            <div className="ask-next-list">
                                {questionLines.length > 0 ? (
                                    questionLines.map((question, i) => (
                                        <div key={i} className="ask-next-line">
                                            {question}
                                        </div>
                                    ))
                                ) : (
                                    <div className="ask-next-empty">No questions saved yet.</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

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
                <>
                    <div className="options-dock-title">THEIR RESPONSE</div>
                    <div className="response-chips">
                        {(['positive', 'neutral', 'negative'] as NodeSentiment[]).map((sentiment) => (
                            <button
                                key={sentiment}
                                className={`response-chip response-${sentiment}${negativePulse && sentiment === 'negative' ? ' pulse' : ''}`}
                                onClick={() => handleSelectResponse(sentiment)}
                            >
                                {sentiment === 'positive' ? 'Positive' : sentiment === 'neutral' ? 'Neutral' : 'Negative'}
                            </button>
                        ))}
                    </div>
                </>
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
                        await saveProject(updatedProject, false);
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
    const [generating] = useState(false);

    useEffect(() => {
        setAiSummary(pathTitles.join(' → '));
    }, [pathTitles]);

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
                    <textarea
                        value={aiSummary}
                        onChange={(e) => setAiSummary(e.target.value)}
                        rows={4}
                        style={{ fontSize: '0.9rem' }}
                    />
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
