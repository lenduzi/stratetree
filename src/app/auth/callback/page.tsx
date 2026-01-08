'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const REDIRECT_KEY = 'yapmap-auth-redirect';

export default function AuthCallbackPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const run = async () => {
            if (!supabase?.auth) {
                setError('Auth is not configured.');
                setLoading(false);
                return;
            }

            const nextFromQuery = searchParams.get('next');
            const nextFromStorage = typeof window !== 'undefined' ? localStorage.getItem(REDIRECT_KEY) : null;
            const redirectPath = nextFromQuery && nextFromQuery.startsWith('/')
                ? nextFromQuery
                : (nextFromStorage && nextFromStorage.startsWith('/') ? nextFromStorage : '/app');

            try {
                const code = searchParams.get('code');
                if (code) {
                    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
                    if (exchangeError) {
                        setError(exchangeError.message);
                        setLoading(false);
                        return;
                    }
                } else if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
                    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
                    const accessToken = hashParams.get('access_token');
                    const refreshToken = hashParams.get('refresh_token');
                    if (accessToken && refreshToken) {
                        await supabase.auth.setSession({
                            access_token: accessToken,
                            refresh_token: refreshToken,
                        });
                    }
                }

                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    if (typeof window !== 'undefined') {
                        localStorage.removeItem(REDIRECT_KEY);
                    }
                    router.replace(redirectPath);
                    return;
                }

                setError('No active session found.');
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Authentication failed.');
            } finally {
                setLoading(false);
            }
        };

        run();
    }, [router, searchParams]);

    if (loading) {
        return (
            <div className="focused-view" style={{ justifyContent: 'center', alignItems: 'center' }}>
                <main className="container container-narrow">
                    <div className="card" style={{ textAlign: 'center' }}>
                        <div className="spinner" style={{ margin: '0 auto var(--space-md)' }} />
                        <h1>Signing you in…</h1>
                        <p className="text-muted">Finishing your authentication.</p>
                    </div>
                </main>
            </div>
        );
    }

    if (error) {
        return (
            <div className="focused-view" style={{ justifyContent: 'center', alignItems: 'center' }}>
                <main className="container container-narrow">
                    <div className="card" style={{ textAlign: 'center' }}>
                        <h1>We couldn’t sign you in</h1>
                        <p className="text-muted">{error}</p>
                        <Link href="/login" className="btn btn-primary mt-lg">
                            Back to Login
                        </Link>
                    </div>
                </main>
            </div>
        );
    }

    return null;
}
