import { useCallback, useEffect, useRef, useState } from 'react';

export function useStagedProgress(stages: string[], targets: number[], minStageMs: number) {
    const [stageIndex, setStageIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const [isRunning, setIsRunning] = useState(false);
    const lastStageAtRef = useRef<number>(0);
    const timerRef = useRef<number | null>(null);

    const prefersReducedMotion = typeof window !== 'undefined'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

    const animateToTarget = useCallback((target: number) => {
        if (prefersReducedMotion) {
            setProgress(target);
            return;
        }
        if (timerRef.current) {
            window.clearInterval(timerRef.current);
        }
        timerRef.current = window.setInterval(() => {
            setProgress((prev) => {
                if (prev >= target) return prev;
                const delta = Math.max(0.6, (target - prev) * 0.08);
                return Math.min(target, prev + delta);
            });
        }, 80);
    }, [prefersReducedMotion]);

    useEffect(() => {
        if (!isRunning) return;
        const target = targets[Math.min(stageIndex, targets.length - 1)] || 0;
        animateToTarget(target);
        return () => {
            if (timerRef.current) {
                window.clearInterval(timerRef.current);
            }
        };
    }, [stageIndex, targets, animateToTarget, isRunning]);

    const startProgress = useCallback(() => {
        setIsRunning(true);
        setStageIndex(0);
        setProgress(0);
        lastStageAtRef.current = Date.now();
    }, []);

    const advanceStage = useCallback(async () => {
        const elapsed = Date.now() - lastStageAtRef.current;
        if (elapsed < minStageMs) {
            await new Promise((resolve) => setTimeout(resolve, minStageMs - elapsed));
        }
        lastStageAtRef.current = Date.now();
        setStageIndex((prev) => Math.min(prev + 1, stages.length - 1));
    }, [minStageMs, stages.length]);

    const finishProgress = useCallback(() => {
        setIsRunning(false);
        setProgress(100);
        if (timerRef.current) {
            window.clearInterval(timerRef.current);
        }
    }, []);

    const resetProgress = useCallback(() => {
        setIsRunning(false);
        setStageIndex(0);
        setProgress(0);
        if (timerRef.current) {
            window.clearInterval(timerRef.current);
        }
    }, []);

    return {
        stageLabel: stages[stageIndex] || stages[0],
        progress,
        startProgress,
        advanceStage,
        finishProgress,
        resetProgress,
    };
}
