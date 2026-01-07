'use client';

import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Project } from '@/lib/types';
import { saveProject } from '@/lib/db';
import { extractStructuredBucketsAction, generateTreeFromBucketsAction, routeScenarioAction, transcribeAudioAction } from '@/lib/actions';
import { getBrowserApiKey } from '@/lib/settings';
import { getClientId } from '@/lib/client-id';
import Link from 'next/link';
import { useStagedProgress } from '@/lib/useStagedProgress';

const MAX_GUEST_PER_DAY = 3;
const STRUCTURING_STAGES = [
  'Distilling your goal…',
  'Understanding who you’re talking to…',
  'Creating scenarios…',
  'Preparing your talk track…',
  'Finalizing…',
];
const STRUCTURING_TARGETS = [10, 30, 55, 80, 95];

type CaptureFlowProps = {
  title?: string;
  primaryLabel?: string;
  microcopy?: string;
  showCancel?: boolean;
  isGuest?: boolean;
  onComplete: (projectId: string) => void;
  onClose?: () => void;
};

type Step = 'capture' | 'structuring';

export function CaptureFlow({
  title,
  primaryLabel = 'Create my YapMap',
  microcopy,
  showCancel = true,
  isGuest = true,
  onComplete,
  onClose,
}: CaptureFlowProps) {
  const [captureText, setCaptureText] = useState('');
  const [step, setStep] = useState<Step>('capture');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const {
    stageLabel,
    progress,
    startProgress,
    advanceStage,
    finishProgress,
    resetProgress,
  } = useStagedProgress(STRUCTURING_STAGES, STRUCTURING_TARGETS, 700);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const shouldProcessRef = useRef(true);

  useEffect(() => {
    return () => {
      stopRecording(false);
    };
  }, []);

  useEffect(() => {
    if (step !== 'structuring') {
      resetProgress();
    }
  }, [step, resetProgress]);

  const getGuestCount = () => {
    if (process.env.NODE_ENV !== 'production') return { count: 0, date: '' };
    if (typeof window === 'undefined') return { count: 0, date: '' };
    const date = localStorage.getItem('yapmap-guest-date') || '';
    const count = parseInt(localStorage.getItem('yapmap-guest-count') || '0', 10);
    return { count, date };
  };

  const incrementGuestCount = () => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined') return;
    const today = new Date().toISOString().slice(0, 10);
    const { count, date } = getGuestCount();
    const nextCount = date === today ? count + 1 : 1;
    localStorage.setItem('yapmap-guest-date', today);
    localStorage.setItem('yapmap-guest-count', String(nextCount));
  };

  const canCreateGuestProject = () => {
    if (process.env.NODE_ENV !== 'production') return true;
    if (typeof window === 'undefined') return true;
    const today = new Date().toISOString().slice(0, 10);
    const { count, date } = getGuestCount();
    if (date !== today) return true;
    return count < MAX_GUEST_PER_DAY;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      shouldProcessRef.current = true;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const tracks = mediaStreamRef.current?.getTracks() || [];
        tracks.forEach(track => track.stop());
        mediaStreamRef.current = null;

        if (!shouldProcessRef.current) {
          setIsProcessing(false);
          return;
        }

        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await handleTranscription(audioBlob);
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = (shouldProcess: boolean) => {
    shouldProcessRef.current = shouldProcess;
    if (!shouldProcess && mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
    }
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
      setIsProcessing(true);
    }
    const tracks = mediaStreamRef.current?.getTracks() || [];
    tracks.forEach(track => track.stop());
    mediaStreamRef.current = null;
    if (!shouldProcess) {
      setIsListening(false);
      setIsProcessing(false);
    }
  };

  const toggleListening = async () => {
    if (isListening) {
      stopRecording(true);
    } else {
      await startRecording();
    }
  };

  const handleTranscription = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      const browserKey = getBrowserApiKey();
      const clientId = getClientId();
      const text = await transcribeAudioAction(formData, browserKey || undefined, clientId);
      const nextText = `${captureText}${captureText && !captureText.endsWith(' ') ? ' ' : ''}${text}`;
      setCaptureText(nextText);
      await startStructuring(nextText);
    } catch (err) {
      console.error('Transcription failed:', err);
      alert('Failed to transcribe audio. Please check your API key.');
      setIsProcessing(false);
    }
  };

  const startStructuring = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    setLimitReached(false);
    if (isGuest && !canCreateGuestProject()) {
        setLimitReached(true);
        setError('Guest limit reached. Sign up to save more YapMaps.');
        return;
    }

    setIsProcessing(true);
    setStep('structuring');
    startProgress();
    setError(null);

    const id = draftId || uuidv4();
    setDraftId(id);

    const draft: Project = {
      id,
      name: 'New Project',
      description: '',
      rootNode: {
        id: uuidv4(),
        title: 'Start of call',
        talkingPoints: [],
        questions: [],
        children: [],
      },
      structured: {
        goal: '',
        stakeholder: '',
        context: '',
        decisionFrame: '',
        rawCapture: trimmed,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveProject(draft);
    await advanceStage();
    if (isGuest) {
      incrementGuestCount();
    }

    try {
      const browserKey = getBrowserApiKey();
      const clientId = getClientId();
      const router = await routeScenarioAction(trimmed, browserKey || undefined, clientId);
      await advanceStage();
      const buckets = await extractStructuredBucketsAction(trimmed, router, browserKey || undefined, clientId);
      await advanceStage();
      const tree = await generateTreeFromBucketsAction(buckets, router, browserKey || undefined, clientId);
      await advanceStage();
      const title = (buckets.title || `${buckets.stakeholder} — ${buckets.goal}`).trim() || 'New Project';
      const updated: Project = {
        ...draft,
        name: title,
        description: buckets.context || trimmed,
        rootNode: tree,
        structured: { ...buckets, rawCapture: trimmed, title, router },
      };
      await saveProject(updated);
      finishProgress();
      onComplete(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to structure project');
      setStep('capture');
      resetProgress();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    stopRecording(false);
    onClose?.();
  };

  return (
    <>
      {title && <h2 className="modal-title">{title}</h2>}
      {step === 'capture' ? (
        <>
          <div className="capture-body">
            <button
              type="button"
              className={`capture-mic ${isListening ? 'is-listening' : ''}`}
              onClick={() => toggleListening()}
              disabled={isProcessing}
            >
              {isListening ? '◼' : '🎤'}
            </button>
            <div className="capture-label">
              {isListening ? 'Tap again to stop' : 'Tap to yap'}
              {isListening && <span className="capture-recording">Recording…</span>}
            </div>
            <textarea
              className="capture-textarea"
              value={captureText}
              onChange={(e) => setCaptureText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  startStructuring(captureText);
                }
              }}
              placeholder="Dump your thoughts. What’s the situation?"
              rows={4}
            />
            {error && (
              <div className="capture-error">
                {error}{' '}
                {limitReached && (
                  <Link href="/app/login" className="capture-signup">
                    Sign up to save
                  </Link>
                )}
              </div>
            )}
            <button
              className="btn btn-primary btn-lg capture-cta"
              onClick={() => startStructuring(captureText)}
              disabled={!captureText.trim()}
            >
              {primaryLabel}
            </button>
            {microcopy && <div className="capture-microcopy">{microcopy}</div>}
          </div>
          {showCancel && (
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={handleClose}>
                Cancel
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="structuring-state">
          <h2 className="modal-title">Structuring your call…</h2>
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
      )}
    </>
  );
}
