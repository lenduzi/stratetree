'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AuthCodeErrorPage() {
    const [details, setDetails] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        const error = url.searchParams.get('error') || url.searchParams.get('error_code');
        const errorDescription = url.searchParams.get('error_description');
        const hash = window.location.hash ? window.location.hash.replace(/^#/, '') : '';
        const hashParams = hash ? new URLSearchParams(hash) : null;
        const hashError = hashParams?.get('error') || null;
        const hashDescription = hashParams?.get('error_description') || null;
        const message = errorDescription || hashDescription || error || hashError;
        if (message) {
            setDetails(message);
        }
    }, []);

    return (
        <div className="focused-view" style={{ justifyContent: 'center', alignItems: 'center' }}>
            <main className="container container-narrow">
                <div className="card" style={{ textAlign: 'center' }}>
                    <h1>Google sign-in failed</h1>
                    <p className="text-muted">
                        {details || 'We couldn’t complete the sign-in. Please try again.'}
                    </p>
                    <Link href="/login" className="btn btn-primary mt-lg">
                        Back to Login
                    </Link>
                </div>
            </main>
        </div>
    );
}
