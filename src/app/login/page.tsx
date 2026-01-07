'use client';

import { login, signup } from './actions';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error');
    const message = searchParams.get('message');

    return (
        <div className="focused-view" style={{ justifyContent: 'center', alignItems: 'center' }}>
            <main className="container container-narrow">
                <div className="card" style={{ maxWidth: 400, margin: '0 auto' }}>
                    <div className="text-center mb-lg">
                        <span style={{ fontSize: '3rem' }}>🌳</span>
                        <h1 style={{ marginTop: 'var(--space-md)' }}>Welcome to YapMap</h1>
                        <p className="text-muted">Sign in to sync your trees</p>
                    </div>

                    <form className="flex flex-col gap-md">
                        <div>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem' }}>Email</label>
                            <input
                                name="email"
                                type="email"
                                placeholder="you@example.com"
                                required
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem' }}>Password</label>
                            <input
                                name="password"
                                type="password"
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
                                formAction={login}
                                className="btn btn-primary w-full"
                            >
                                Sign In
                            </button>
                            <button
                                formAction={signup}
                                className="btn btn-secondary w-full"
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
