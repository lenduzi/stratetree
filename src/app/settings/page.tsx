'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { isServerApiKeyConfigured } from '@/lib/actions';
import { getBrowserApiKey, setBrowserApiKey, clearBrowserApiKey } from '@/lib/settings';
import { exportAllData, importData } from '@/lib/db';

export default function SettingsPage() {
    const [isServerConfigured, setIsServerConfigured] = useState<boolean | null>(null);
    const [browserKey, setBrowserKey] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [showKey, setShowKey] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        checkConfig();
        const savedKey = getBrowserApiKey();
        if (savedKey) setBrowserKey(savedKey);
    }, []);

    const checkConfig = async () => {
        const configured = await isServerApiKeyConfigured();
        setIsServerConfigured(configured);
    };

    const handleSaveKey = () => {
        setIsSaving(true);
        setBrowserApiKey(browserKey);
        setTimeout(() => {
            setIsSaving(false);
            alert('API Key saved locally in your browser.');
        }, 500);
    };

    const handleClearKey = () => {
        if (confirm('Clear the locally saved API Key?')) {
            clearBrowserApiKey();
            setBrowserKey('');
        }
    };

    const handleExport = async () => {
        const data = await exportAllData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stratetree-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const imported = await importData(text);
        alert(`Imported ${imported} projects.`);
        e.target.value = '';
    };

    const hasAnyKey = isServerConfigured || !!browserKey;

    return (
        <div className="focused-view">
            <header className="header">
                <Link href="/app" className="logo">
                    <span className="logo-icon">🌳</span>
                    <span>YapMap</span>
                </Link>
            </header>

            <main className="container container-narrow">
                <h1 className="mb-lg">Settings</h1>

                <div className="card">
                    <h2 style={{ marginBottom: 'var(--space-md)' }}>OpenAI Configuration</h2>

                    {/* Status Indicator */}
                    <div className="flex items-center gap-md mb-lg p-md" style={{
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${hasAnyKey ? 'var(--success-border)' : 'var(--danger-border)'}`
                    }}>
                        <div style={{ fontSize: '1.5rem' }}>
                            {hasAnyKey ? '✅' : '❌'}
                        </div>
                        <div>
                            <div style={{ fontWeight: 600 }}>
                                {!hasAnyKey ? 'API Key Missing' : isServerConfigured ? 'Server Key Active' : 'Browser Key Active'}
                            </div>
                            <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                                {isServerConfigured
                                    ? 'The server is configured with a global API key.'
                                    : browserKey
                                        ? 'Using the API key stored in your browser settings.'
                                        : 'No API key found. AI features are disabled.'}
                            </div>
                        </div>
                    </div>

                    {/* API Key Input */}
                    <div className="flex flex-col gap-sm">
                        <label style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                            Your OpenAI API Key (Browser Override)
                        </label>
                        <div className="flex gap-sm">
                            <input
                                type={showKey ? 'text' : 'password'}
                                value={browserKey}
                                onChange={(e) => setBrowserKey(e.target.value)}
                                placeholder="sk-..."
                                style={{ flex: 1 }}
                            />
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowKey(!showKey)}
                                title={showKey ? 'Hide' : 'Show'}
                            >
                                {showKey ? '👁️‍🗨️' : '👁️'}
                            </button>
                        </div>
                        <p className="text-muted" style={{ fontSize: '0.8rem' }}>
                            This key is stored only in your browser's local storage and is never saved on our servers.
                        </p>

                        <div className="flex gap-sm mt-sm">
                            <button
                                className="btn btn-primary"
                                onClick={handleSaveKey}
                                disabled={isSaving || !browserKey}
                            >
                                {isSaving ? 'Saving...' : 'Save Browser Key'}
                            </button>
                            {getBrowserApiKey() && (
                                <button className="btn btn-danger" onClick={handleClearKey}>
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>

                    {!isServerConfigured && !browserKey && (
                        <div
                            style={{
                                padding: 'var(--space-md)',
                                background: 'var(--bg-secondary)',
                                borderLeft: '4px solid var(--warning)',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '0.9rem',
                                marginTop: 'var(--space-lg)'
                            }}
                        >
                            <p style={{ marginBottom: 8 }}><strong>Pro Tip:</strong></p>
                            <p className="text-muted">
                                If you are the owner of this installation, you can also set a global key by adding <code>OPENAI_API_KEY</code> to your <code>.env.local</code> file.
                            </p>
                        </div>
                    )}
                </div>

                <div className="card mt-lg">
                    <h2 style={{ marginBottom: 'var(--space-md)' }}>Keyboard Shortcuts (Live Mode)</h2>
                    <div className="flex flex-col gap-sm" style={{ fontSize: '0.9rem' }}>
                        <div><span className="kbd">1</span>-<span className="kbd">9</span> Select option by number</div>
                        <div><span className="kbd">↑</span><span className="kbd">↓</span> Navigate options</div>
                        <div><span className="kbd">Enter</span> Select highlighted option</div>
                        <div><span className="kbd">Backspace</span> Go back</div>
                        <div><span className="kbd">F</span> Toggle full tree view</div>
                        <div><span className="kbd">P</span> Panic button</div>
                    </div>
                </div>

                <div className="card mt-lg">
                    <h2 style={{ marginBottom: 'var(--space-md)' }}>Data Management</h2>
                    <div className="flex gap-sm">
                        <button className="btn btn-secondary" onClick={handleImport}>
                            Import
                        </button>
                        <button className="btn btn-secondary" onClick={handleExport}>
                            Export
                        </button>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/json"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                    />
                </div>

                <Link href="/app" className="btn btn-secondary mt-lg">
                    ← Back to Projects
                </Link>
            </main>
        </div>
    );
}
