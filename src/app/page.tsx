'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { CaptureFlow } from '@/components/CaptureFlow';
import { ThemeToggle } from '@/components/ThemeProvider';
import { DemoSection } from '@/components/landing/DemoSection';
import { supabase } from '@/lib/supabase';

const ROTATING_WORDS = [
  'salary negotiation',
  'tough conversation',
  'job interview',
  'partnership pitch',
  'performance review',
  'first date',
];

export default function LandingPage() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let mounted = true;
    const checkAuth = async () => {
      if (!supabase?.auth) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) {
        setIsAuthed(!!user);
      }
    };
    checkAuth();
    const { data } = supabase?.auth?.onAuthStateChange(() => {
      checkAuth();
    }) || { data: null };
    return () => {
      mounted = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  const rotatingWord = ROTATING_WORDS[index];

  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-brand">
          <Image
            src="/brand/hugging-brain.png"
            alt="YapMap mascot"
            width={40}
            height={40}
          />
          <span>YapMap</span>
        </div>
        <div className="landing-header-actions">
          <ThemeToggle />
          {isAuthed ? (
            <Link href="/app" className="btn btn-secondary btn-sm landing-login">
              Dashboard
            </Link>
          ) : (
            <Link href="/login?redirect=/app" className="btn btn-secondary btn-sm landing-login">
              Log in
            </Link>
          )}
        </div>
      </header>

      <main className="landing-main">
        <div className="landing-hero">
          <h1 className="landing-headline">
            <span className="headline-static">Master your next</span>
            <span className="rotating-slot">
              <span key={rotatingWord} className="rotating-word">
                {rotatingWord}
              </span>
            </span>
          </h1>
          <p className="landing-subtext">
            Structure your convo and reach your goal
          </p>
        </div>

        <div className="landing-capture">
          <CaptureFlow
            primaryLabel="Get my game plan"
            microcopy="Free to try • No signup • Live prompts during the convo"
            placeholder="What's the situation? Who's involved, and what do you want to achieve?"
            showCaptureHeader={false}
            showVoiceHint={false}
            autoSubmitOnTranscribe={false}
            showCancel={false}
            isGuest
            onComplete={(projectId) => router.push(`/app/project/${projectId}`)}
          />
        </div>

      </main>

      <section className="landing-pillars">
        <div className="pillar-card">
          <div className="pillar-eyebrow">SECURE</div>
          <div className="pillar-title">Private by default</div>
          <div className="pillar-body">Your input stays yours — shared with no one.</div>
        </div>
        <div className="pillar-card">
          <div className="pillar-eyebrow">FREE</div>
          <div className="pillar-title">Try it instantly</div>
          <div className="pillar-body">No signup required.</div>
        </div>
        <div className="pillar-card">
          <div className="pillar-eyebrow">SMART</div>
          <div className="pillar-title">Real-time help</div>
          <div className="pillar-body">Get live prompts when the convo takes a turn.</div>
        </div>
      </section>

      <DemoSection />
    </div>
  );
}
