'use server';

import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

export async function login(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        return redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }

    return redirect('/');
}

export async function signup(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    // For Vercel, we need the deployment URL + callback
    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const supabase = await createClient();

    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: `${origin}/auth/callback`,
        },
    });

    if (error) {
        return redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }

    return redirect('/login?message=Check your email for the confirmation link!');
}
