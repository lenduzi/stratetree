'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { CaptureFlow } from '@/components/CaptureFlow';

const ROTATING_WORDS = [
  'call',
  'salary negotiation',
  'tough conversation',
  'partnership pitch',
  'customer escalation',
];

export default function LandingPage() {
  const router = useRouter();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  const rotatingWord = ROTATING_WORDS[index];

  return (
    <div className="landing">
      <main className="landing-main">
        <div className="landing-hero">
          <div className="landing-brand">
            <Image
              src="/brand/hugging-brain.png"
              alt="YapMap mascot"
              width={56}
              height={56}
            />
            <span>YapMap</span>
          </div>
          <h1 className="landing-headline">
            Plan your next{' '}
            <span key={rotatingWord} className="rotating-word">
              {rotatingWord}
            </span>
          </h1>
          <p className="landing-subtext">
            Capture the situation, let AI structure it, then go live.
          </p>
        </div>

        <div className="landing-capture">
          <CaptureFlow
            primaryLabel="Create my YapMap"
            microcopy="No signup needed • Free to try • Yappi helps you stay calm"
            showCancel={false}
            isGuest
            onComplete={(projectId) => router.push(`/app/project/${projectId}`)}
          />
        </div>

        <div className="landing-links">
          <Link href="/app" className="text-muted">
            Open full app
          </Link>
        </div>
      </main>

      <section className="landing-demo">
        <div className="demo-placeholder">
          Demo coming soon. (TODO: add /public/demo.mp4)
        </div>
      </section>
    </div>
  );
}
