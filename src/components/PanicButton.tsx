'use client';

import { useEffect, useState } from 'react';
import { TreeNode } from '@/lib/types';
import { handleObjectionAction } from '@/lib/actions';
import { getBrowserApiKey } from '@/lib/settings';

interface PanicButtonProps {
    currentNode: TreeNode;
    projectContext?: string;
    onNewNodes?: (nodes: TreeNode[]) => void;
}

const OBJECTION_TYPES = [
    { id: 'pricing', label: '💰 Pricing / Budget', description: 'Too expensive, not in budget' },
    { id: 'timing', label: '⏰ Timing', description: 'Not the right time, too busy' },
    { id: 'competition', label: '🏆 Competition', description: 'Using another solution' },
    { id: 'authority', label: '👤 Authority', description: 'Need to talk to someone else' },
    { id: 'need', label: '🤔 Need', description: "Don't see the need / value" },
    { id: 'other', label: '❓ Other', description: 'Something unexpected' },
];

export function PanicButton({ currentNode, projectContext, onNewNodes }: PanicButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    const handleSelect = async (objectionType: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const newNodes = await handleObjectionAction(
                objectionType,
                currentNode,
                projectContext,
                getBrowserApiKey() || undefined
            );
            onNewNodes?.(newNodes);
            setIsOpen(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to generate response');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ position: 'relative' }}>
            {isOpen && (
                <div className="panic-backdrop" onClick={() => setIsOpen(false)}>
                    <div
                        className="panic-modal"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="panic-menu">
                            {error && (
                                <div style={{ color: 'var(--danger)', padding: 'var(--space-sm)', fontSize: '0.85rem' }}>
                                    {error}
                                </div>
                            )}
                            {isLoading ? (
                                <div className="flex items-center justify-center gap-sm" style={{ padding: 'var(--space-md)' }}>
                                    <div className="spinner" style={{ width: 20, height: 20 }} />
                                    <span>Generating response...</span>
                                </div>
                            ) : (
                                <>
                                    <div style={{
                                        padding: 'var(--space-sm) var(--space-md)',
                                        fontSize: '0.75rem',
                                        color: 'var(--text-muted)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em'
                                    }}>
                                        What objection?
                                    </div>
                                    {OBJECTION_TYPES.map((type) => (
                                        <button
                                            key={type.id}
                                            className="panic-option"
                                            onClick={() => handleSelect(type.id)}
                                        >
                                            <div style={{ fontWeight: 500 }}>{type.label}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {type.description}
                                            </div>
                                        </button>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <button
                className="btn btn-panic btn-lg"
                onClick={() => setIsOpen(!isOpen)}
                title="Panic Button (P)"
            >
                🆘 Panic
            </button>
        </div>
    );
}
