'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            setError(error.message);
        } else {
            router.push('/');
            router.refresh();
        }
        setLoading(false);
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
        });

        if (error) {
            setError(error.message);
        } else {
            setMessage('Check your email for the confirmation link!');
        }
        setLoading(false);
    };

    return (
        <div className="focused-view" style={{ justifyContent: 'center', alignItems: 'center' }}>
            <main className="container container-narrow">
                <div className="card" style={{ maxWidth: 400, margin: '0 auto' }}>
                    <div className="text-center mb-lg">
                        <span style={{ fontSize: '3rem' }}>🌳</span>
                        <h1 style={{ marginTop: 'var(--space-md)' }}>Welcome to Stratetree</h1>
                        <p className="text-muted">Sign in to sync your trees</p>
                    </div>

                    <form className="flex flex-col gap-md">
                        <div>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem' }}>Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem' }}>Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        {error && (
                            <div style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</div>
                        )}
                        {message && (
                            <div style={{ color: 'var(--success)', fontSize: '0.85rem' }}>{message}</div>
                        )}

                        <div className="flex flex-col gap-sm mt-md">
                            <button
                                className="btn btn-primary w-full"
                                onClick={handleLogin}
                                disabled={loading}
                            >
                                {loading ? 'Processing...' : 'Sign In'}
                            </button>
                            <button
                                className="btn btn-secondary w-full"
                                onClick={handleSignUp}
                                disabled={loading}
                            >
                                Create Account
                            </button>
                        </div>
                    </form>

                    <div className="mt-lg text-center" style={{ fontSize: '0.8rem' }}>
                        <Link href="/" className="text-muted">Continue as guest (local only)</Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
