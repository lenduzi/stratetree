import { useEffect } from 'react';
import { useStagedProgress } from '@/lib/useStagedProgress';

const STAGES = [
    'Distilling your goal…',
    'Understanding who you’re talking to…',
    'Creating scenarios…',
    'Preparing your talk track…',
    'Finalizing…',
];

const TARGETS = [10, 30, 55, 80, 95];

export function DemoStructuring() {
    const { stageLabel, progress, startProgress, advanceStage, finishProgress, resetProgress } =
        useStagedProgress(STAGES, TARGETS, 700);

    useEffect(() => {
        let mounted = true;
        const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
        const runLoop = async () => {
            while (mounted) {
                resetProgress();
                startProgress();
                for (let i = 1; i < STAGES.length; i += 1) {
                    if (!mounted) return;
                    await delay(1200);
                    await advanceStage();
                }
                if (!mounted) return;
                await delay(1200);
                finishProgress();
                await delay(800);
            }
        };
        runLoop();
        return () => {
            mounted = false;
        };
    }, [advanceStage, finishProgress, resetProgress, startProgress]);

    return (
        <div className="structuring-state demo-structuring">
            <h2 className="modal-title">Structuring your conversation…</h2>
            <div className="structuring-status">{stageLabel}</div>
            <div className="structuring-progress">
                <div className="structuring-progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <div className="structuring-skeleton">
                {['Goal', 'Who am I talking to?', 'What’s the situation?', 'If they say X → I say Y'].map((label) => (
                    <div key={label} className="skeleton-bucket">
                        <div className="skeleton-label">{label}</div>
                        <div className="skeleton-line" />
                        <div className="skeleton-line short" />
                    </div>
                ))}
            </div>
        </div>
    );
}
