'use client';

import { useState } from 'react';
import { TreeNode, NodeSentiment, NodeType, ObjectionBundle } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import { updateNodeInTree, addChildToNode, deleteNodeFromTree } from '@/lib/hooks';
import { getSentimentEmoji } from './NodeCard';
import { validateObjectionBundle } from '@/lib/objection-validator';

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

const TYPE_OPTIONS: { value: NodeType; label: string }[] = [
    { value: 'decision', label: 'Decision' },
    { value: 'objection', label: 'Objection' },
    { value: 'info', label: 'Info' },
];

const emptyBundle = (): ObjectionBundle => ({
    primaryLine: '',
    diagnoseQuestion: '',
    responses: { soft: '', direct: '' },
    nextStep: '',
    tags: [],
    needsFill: true,
});

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
    const [editType, setEditType] = useState<NodeType>(node.type || (node.objectionBundle ? 'objection' : 'decision'));
    const [editBundle, setEditBundle] = useState<ObjectionBundle>(node.objectionBundle || emptyBundle());

    const handleSave = () => {
        const normalizedBundle = editType === 'objection'
            ? {
                ...editBundle,
                tags: editBundle.tags || [],
                responses: {
                    soft: editBundle.responses?.soft || '',
                    direct: editBundle.responses?.direct || '',
                    challenger: editBundle.responses?.challenger || '',
                },
            }
            : undefined;
        const quality = normalizedBundle ? validateObjectionBundle(normalizedBundle) : undefined;
        const updatedNode: TreeNode = {
            ...node,
            title: editTitle,
            talkingPoints: editPoints.split('\n').filter(p => p.trim()),
            questions: editQuestions.split('\n').filter(q => q.trim()),
            sentiment: editSentiment,
            type: editType,
            objectionBundle: normalizedBundle,
            objectionQuality: quality,
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
    const objectionQuality = node.objectionQuality || (node.objectionBundle ? validateObjectionBundle(node.objectionBundle) : undefined);
    const objectionSummary = objectionQuality
        ? `${objectionQuality.errors.length} errors • ${objectionQuality.warnings.length} warnings • score ${objectionQuality.score}`
        : null;

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
                            <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                Node type
                            </label>
                            <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                                {TYPE_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setEditType(opt.value)}
                                        className="btn btn-sm"
                                        style={{
                                            background: editType === opt.value ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                                            color: editType === opt.value ? 'white' : 'var(--text-primary)',
                                            border: 'none',
                                        }}
                                    >
                                        {opt.label}
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
                                style={{ borderColor: 'var(--accent-primary)', background: 'var(--accent-soft)' }}
                            />
                        </div>

                        {editType === 'objection' && (
                            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-md)' }}>
                                <div style={{ fontWeight: 600, marginBottom: 8 }}>Objection bundle</div>
                                <div className="flex flex-col gap-sm">
                                    <textarea
                                        value={editBundle.primaryLine}
                                        onChange={(e) => setEditBundle((prev) => ({ ...prev, primaryLine: e.target.value }))}
                                        placeholder="Primary line (<=2 sentences)"
                                        rows={2}
                                    />
                                    <textarea
                                        value={editBundle.diagnoseQuestion}
                                        onChange={(e) => setEditBundle((prev) => ({ ...prev, diagnoseQuestion: e.target.value }))}
                                        placeholder="Diagnose question (<=1 sentence)"
                                        rows={2}
                                    />
                                    <textarea
                                        value={editBundle.responses.soft}
                                        onChange={(e) => setEditBundle((prev) => ({
                                            ...prev,
                                            responses: { ...prev.responses, soft: e.target.value }
                                        }))}
                                        placeholder="Soft response (<=2 sentences)"
                                        rows={2}
                                    />
                                    <textarea
                                        value={editBundle.responses.direct}
                                        onChange={(e) => setEditBundle((prev) => ({
                                            ...prev,
                                            responses: { ...prev.responses, direct: e.target.value }
                                        }))}
                                        placeholder="Direct response (<=2 sentences)"
                                        rows={2}
                                    />
                                    <textarea
                                        value={editBundle.responses.challenger || ''}
                                        onChange={(e) => setEditBundle((prev) => ({
                                            ...prev,
                                            responses: { ...prev.responses, challenger: e.target.value }
                                        }))}
                                        placeholder="Challenger response (optional)"
                                        rows={2}
                                    />
                                    <textarea
                                        value={editBundle.proof || ''}
                                        onChange={(e) => setEditBundle((prev) => ({ ...prev, proof: e.target.value }))}
                                        placeholder="Proof line (optional, <=1 sentence)"
                                        rows={2}
                                    />
                                    <textarea
                                        value={editBundle.riskReset || ''}
                                        onChange={(e) => setEditBundle((prev) => ({ ...prev, riskReset: e.target.value }))}
                                        placeholder="Risk reset (optional, <=1 sentence)"
                                        rows={2}
                                    />
                                    <textarea
                                        value={editBundle.nextStep}
                                        onChange={(e) => setEditBundle((prev) => ({ ...prev, nextStep: e.target.value }))}
                                        placeholder="Next step (<=1 sentence)"
                                        rows={2}
                                    />
                                    <input
                                        type="text"
                                        value={editBundle.tags.join(', ')}
                                        onChange={(e) => setEditBundle((prev) => ({ ...prev, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
                                        placeholder="Tags (comma separated)"
                                    />
                                    {(() => {
                                        const quality = validateObjectionBundle(editBundle);
                                        return (
                                            <div style={{ fontSize: '0.85rem', color: quality.errors.length ? 'var(--danger)' : 'var(--text-muted)' }}>
                                                {quality.errors.length > 0
                                                    ? `Errors: ${quality.errors.join(' • ')}`
                                                    : `Score ${quality.score} • ${quality.warnings.length} warnings`}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}

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
                                    setEditType(node.type || (node.objectionBundle ? 'objection' : 'decision'));
                                    setEditBundle(node.objectionBundle || emptyBundle());
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
                                        {(node.type === 'objection' || node.objectionBundle) && objectionSummary && (
                                            <span style={{ marginLeft: 8, color: node.objectionQuality?.errors.length ? 'var(--danger)' : 'var(--text-muted)' }}>
                                                🛡️ {objectionSummary}
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
