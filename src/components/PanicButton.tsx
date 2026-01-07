'use client';

import { useEffect, useState } from 'react';

interface PanicButtonProps {
    nudgeActive?: boolean;
    objections: string[];
    onSelect: (label: string) => void;
}

export function PanicButton({ nudgeActive, objections, onSelect }: PanicButtonProps) {
    const [isOpen, setIsOpen] = useState(false);

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
                            <div style={{
                                padding: 'var(--space-sm) var(--space-md)',
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em'
                            }}>
                                Why are they resisting?
                            </div>
                            {objections.map((label) => (
                                <button
                                    key={label}
                                    className="panic-option"
                                    onClick={() => {
                                        onSelect(label);
                                        setIsOpen(false);
                                    }}
                                >
                                    <div style={{ fontWeight: 600 }}>{label}</div>
                                </button>
                            ))}
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
