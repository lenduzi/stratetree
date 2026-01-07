'use client';

import { useState } from 'react';
import { TreeNode, NodeSentiment } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import { updateNodeInTree, addChildToNode, deleteNodeFromTree } from '@/lib/hooks';
import { getSentimentEmoji } from './NodeCard';

interface TreeEditorProps {
    rootNode: TreeNode;
    onChange: (newRoot: TreeNode) => void;
}

export function TreeEditor({ rootNode, onChange }: TreeEditorProps) {
    return (
        <div className="tree-editor">
            <TreeNodeEditor
                node={rootNode}
                rootNode={rootNode}
                onChange={onChange}
                isRoot
            />
        </div>
    );
}

interface TreeNodeEditorProps {
    node: TreeNode;
    rootNode: TreeNode;
    onChange: (newRoot: TreeNode) => void;
    isRoot?: boolean;
    onDelete?: () => void;
}

const SENTIMENT_OPTIONS: { value: NodeSentiment | undefined; label: string; emoji: string }[] = [
    { value: undefined, label: 'None', emoji: '⚪' },
    { value: 'positive', label: 'Positive', emoji: '🟢' },
    { value: 'neutral', label: 'Neutral', emoji: '🟡' },
    { value: 'negative', label: 'Negative', emoji: '🔴' },
];

function TreeNodeEditor({
    node,
    rootNode,
    onChange,
    isRoot = false,
    onDelete
}: TreeNodeEditorProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(node.title);
    const [editPoints, setEditPoints] = useState(node.talkingPoints.join('\n'));
    const [editQuestions, setEditQuestions] = useState((node.questions || []).join('\n'));
    const [editSentiment, setEditSentiment] = useState<NodeSentiment | undefined>(node.sentiment);

    const handleSave = () => {
        const updatedNode: TreeNode = {
            ...node,
            title: editTitle,
            talkingPoints: editPoints.split('\n').filter(p => p.trim()),
            questions: editQuestions.split('\n').filter(q => q.trim()),
            sentiment: editSentiment,
        };
        onChange(updateNodeInTree(rootNode, node.id, () => updatedNode));
        setIsEditing(false);
    };

    const handleAddChild = () => {
        const newChild: TreeNode = {
            id: uuidv4(),
            title: 'New option',
            talkingPoints: [],
            questions: [],
            children: [],
        };
        onChange(addChildToNode(rootNode, node.id, newChild));
    };

    const handleDelete = () => {
        if (confirm('Delete this node and all its children?')) {
            onChange(deleteNodeFromTree(rootNode, node.id));
            onDelete?.();
        }
    };

    const questionsCount = node.questions?.length || 0;
    const sentimentEmoji = getSentimentEmoji(node.sentiment);

    return (
        <div style={{ marginBottom: 8 }}>
            <div
                className="tree-node-edit"
                style={{
                    marginLeft: isRoot ? 0 : undefined,
                    borderLeftColor: node.sentiment === 'positive' ? 'var(--success)' :
                        node.sentiment === 'negative' ? 'var(--danger)' :
                            node.sentiment === 'neutral' ? 'var(--warning)' : undefined,
                    borderLeftWidth: node.sentiment ? 4 : undefined,
                }}
            >
                {isEditing ? (
                    <div className="flex flex-col gap-md">
                        <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            placeholder="Node title"
                            autoFocus
                        />

                        {/* Sentiment selector */}
                        <div>
                            <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                Sentiment (color coding)
                            </label>
                            <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                                {SENTIMENT_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.label}
                                        type="button"
                                        onClick={() => setEditSentiment(opt.value)}
                                        className="btn btn-sm"
                                        style={{
                                            background: editSentiment === opt.value ?
                                                (opt.value === 'positive' ? 'var(--success)' :
                                                    opt.value === 'negative' ? 'var(--danger)' :
                                                        opt.value === 'neutral' ? 'var(--warning)' : 'var(--bg-tertiary)')
                                                : 'var(--bg-tertiary)',
                                            color: editSentiment === opt.value && opt.value ? 'white' : 'var(--text-primary)',
                                            border: 'none',
                                        }}
                                    >
                                        {opt.emoji} {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                Talking Points (one per line)
                            </label>
                            <textarea
                                value={editPoints}
                                onChange={(e) => setEditPoints(e.target.value)}
                                placeholder="What to say at this point..."
                                rows={3}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', color: 'var(--accent-secondary)' }}>
                                🎯 Discovery Questions (one per line)
                            </label>
                            <textarea
                                value={editQuestions}
                                onChange={(e) => setEditQuestions(e.target.value)}
                                placeholder="What questions to ask the client..."
                                rows={3}
                                style={{ borderColor: 'var(--accent-primary)', background: 'rgba(99, 102, 241, 0.05)' }}
                            />
                        </div>
                        <div className="flex gap-sm">
                            <button className="btn btn-primary btn-sm" onClick={handleSave}>
                                Save
                            </button>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                    setIsEditing(false);
                                    setEditTitle(node.title);
                                    setEditPoints(node.talkingPoints.join('\n'));
                                    setEditQuestions((node.questions || []).join('\n'));
                                    setEditSentiment(node.sentiment);
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between gap-md">
                            <div className="flex items-center gap-sm">
                                {node.children.length > 0 && (
                                    <button
                                        onClick={() => setIsExpanded(!isExpanded)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: 4,
                                            color: 'var(--text-muted)',
                                        }}
                                    >
                                        {isExpanded ? '▼' : '▶'}
                                    </button>
                                )}
                                <div>
                                    <div style={{ fontWeight: 600 }}>
                                        {sentimentEmoji && <span style={{ marginRight: 6 }}>{sentimentEmoji}</span>}
                                        {node.title}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        {node.talkingPoints.length > 0 && (
                                            <span>{node.talkingPoints.length} point{node.talkingPoints.length !== 1 ? 's' : ''}</span>
                                        )}
                                        {node.talkingPoints.length > 0 && questionsCount > 0 && ' • '}
                                        {questionsCount > 0 && (
                                            <span style={{ color: 'var(--accent-secondary)' }}>
                                                🎯 {questionsCount} question{questionsCount !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-sm">
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setIsEditing(true)}
                                >
                                    Edit
                                </button>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleAddChild}
                                >
                                    + Child
                                </button>
                                {!isRoot && (
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={handleDelete}
                                        style={{ color: 'var(--danger)' }}
                                    >
                                        Delete
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {isExpanded && Array.isArray(node.children) && node.children.length > 0 && (
                <div className="tree-children">
                    {node.children.map((child) => (
                        <TreeNodeEditor
                            key={child.id}
                            node={child}
                            rootNode={rootNode}
                            onChange={onChange}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
