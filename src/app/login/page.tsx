'use client';

import { login, signup } from './actions';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const error = searchParams.get('error');
    const message = searchParams.get('message');
    const redirectPath = searchParams.get('redirect') || '/app';
    const [oauthError, setOauthError] = useState<string | null>(null);
    const [checkingSession, setCheckingSession] = useState(true);

    useEffect(() => {
        const checkSession = async () => {
            if (!supabase?.auth) {
                setCheckingSession(false);
                return;
            }
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                router.replace(redirectPath);
                return;
            }
            setCheckingSession(false);
        };
        checkSession();
    }, [redirectPath, router]);

    const handleGoogleLogin = async () => {
        setOauthError(null);
        if (!supabase?.auth) {
            setOauthError('Auth is not configured.');
            return;
        }
        const origin = window.location.origin;
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectPath)}`,
            },
        });
        if (error) {
            setOauthError(error.message);
        }
    };

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
                        <input type="hidden" name="redirect" value={redirectPath} />

                        <button
                            type="button"
                            className="btn btn-google w-full"
                            onClick={handleGoogleLogin}
                            disabled={checkingSession}
                        >
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

                        <div className="login-divider">
                            <span>or continue with email</span>
                        </div>

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
                        {oauthError && (
                            <div style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{oauthError}</div>
                        )}
                        {message && (
                            <div style={{ color: 'var(--success)', fontSize: '0.85rem' }}>{message}</div>
                        )}

                        <div className="flex flex-col gap-sm mt-md">
                            <button
                                formAction={login}
                                className="btn btn-primary w-full"
                                disabled={checkingSession}
                            >
                                Sign In
                            </button>
                            <button
                                formAction={signup}
                                className="btn btn-secondary w-full"
                                disabled={checkingSession}
                            >
                                Create Account
                            </button>
                        </div>
                    </form>

                    <div className="mt-lg text-center" style={{ fontSize: '0.8rem' }}>
                        <Link href="/app" className="text-muted">Continue as guest (local only)</Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
