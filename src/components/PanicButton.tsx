'use client';

import { useEffect, useState } from 'react';
import { ScenarioRouterResult, TreeNode } from '@/lib/types';
import { getPanicOptionsAction, handleObjectionAction } from '@/lib/actions';
import { getBrowserApiKey } from '@/lib/settings';
import { getClientId } from '@/lib/client-id';

interface PanicButtonProps {
    currentNode: TreeNode;
    projectGoal?: string;
    router?: ScenarioRouterResult;
    lastMoveLabel?: string;
    nudgeActive?: boolean;
    onNewNodes?: (nodes: TreeNode[]) => void;
}

export function PanicButton({ currentNode, projectGoal, router, lastMoveLabel, nudgeActive, onNewNodes }: PanicButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingOptions, setIsLoadingOptions] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [options, setOptions] = useState<Array<{ title: string; description?: string }>>([]);

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

    useEffect(() => {
        setOptions([]);
    }, [currentNode.id, projectGoal, router?.scenario_type]);

    useEffect(() => {
        if (!isOpen || options.length > 0 || isLoadingOptions) return;
        const load = async () => {
            setIsLoadingOptions(true);
            setError(null);
            try {
                const browserKey = getBrowserApiKey();
                const nextOptions = await getPanicOptionsAction(
                    currentNode,
                    projectGoal,
                    router,
                    lastMoveLabel,
                    browserKey || undefined,
                    getClientId()
                );
                setOptions(nextOptions);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to load options');
            } finally {
                setIsLoadingOptions(false);
            }
        };
        load();
    }, [isOpen, options.length, isLoadingOptions, currentNode, projectGoal, router, lastMoveLabel]);

    const handleSelect = async (optionTitle: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const newNodes = await handleObjectionAction(
                optionTitle,
                currentNode,
                projectGoal,
                router,
                lastMoveLabel,
                getBrowserApiKey() || undefined,
                getClientId()
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
                            {isLoading || isLoadingOptions ? (
                                <div className="flex items-center justify-center gap-sm" style={{ padding: 'var(--space-md)' }}>
                                    <div className="spinner" style={{ width: 20, height: 20 }} />
                                    <span>{isLoading ? 'Generating response...' : 'Loading options...'}</span>
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
                                        What do they say?
                                    </div>
                                    {options.length === 0 ? (
                                        <div style={{ padding: 'var(--space-md)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            No options yet. Try again.
                                        </div>
                                    ) : (
                                        options.map((option) => (
                                            <button
                                                key={option.title}
                                                className="panic-option"
                                                onClick={() => handleSelect(option.title)}
                                            >
                                                <div style={{ fontWeight: 500 }}>{option.title}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                    {option.description}
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <button
                className={`btn btn-panic btn-lg${nudgeActive ? ' panic-pulse' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                title="Panic Button (P)"
            >
                🆘 Panic
            </button>
        </div>
    );
}
