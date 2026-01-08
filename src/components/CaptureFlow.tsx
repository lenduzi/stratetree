'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Project, StructuredBuckets, TreeNode, ScenarioRouterResult } from '@/lib/types';
import { saveProject } from '@/lib/db';
import { extractStructuredBucketsAction, generateObjectionHandlersAction, generateProjectBundleAction, generateScenarioObjectionsAction, generateTreeFromBucketsAction, routeScenarioAction, transcribeAudioAction, validateCaptureAction } from '@/lib/actions';
import { getBrowserApiKey } from '@/lib/settings';
import { getClientId } from '@/lib/client-id';
import Link from 'next/link';
import { useStagedProgress } from '@/lib/useStagedProgress';
import { guestLimitReached, markGuestLimitAck, upsertGuestProject } from '@/lib/guest';
import { supabase } from '@/lib/supabase';

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
  placeholder?: string;
  showCaptureHeader?: boolean;
  showVoiceHint?: boolean;
  autoSubmitOnTranscribe?: boolean;
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
  placeholder = "Dump your thoughts. What’s the situation?",
  showCaptureHeader = true,
  showVoiceHint = true,
  autoSubmitOnTranscribe = false,
  showCancel = true,
  isGuest = true,
  onComplete,
  onClose,
}: CaptureFlowProps) {
  const textareaId = useId();
  const [captureText, setCaptureText] = useState('');
  const [step, setStep] = useState<Step>('capture');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardrailMessage, setGuardrailMessage] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [voiceUsed, setVoiceUsed] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [showGuestLimitModal, setShowGuestLimitModal] = useState(false);
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

  const canCreateGuestProject = () => !guestLimitReached();

  const startRecording = async () => {
    try {
      setVoiceUsed(true);
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
      setLastTranscript(text);
      const nextText = `${captureText}${captureText && !captureText.endsWith(' ') ? ' ' : ''}${text}`;
      setCaptureText(nextText);
      if (autoSubmitOnTranscribe) {
        await startStructuring(nextText);
      } else {
        setIsProcessing(false);
      }
    } catch (err) {
      console.error('Transcription failed:', err);
      alert('Failed to transcribe audio. Please check your API key.');
      setIsProcessing(false);
    }
  };

  const validateCapture = (text: string, usedVoice: boolean, transcript: string) => {
    const trimmed = text.trim();
    const transcriptTrim = transcript.trim();
    if (!trimmed) return { ok: false };
    if (usedVoice && transcriptTrim.length < 8) return { ok: false };

    const wordishTokens = trimmed
      .split(/\s+/)
      .filter((token) => /\p{L}{2,}/u.test(token))
      .length;
    const hasLetterSpaceLetter = /\p{L}+\s+\p{L}+/u.test(trimmed);
    const passes =
      (trimmed.length >= 12 && wordishTokens >= 2) ||
      hasLetterSpaceLetter ||
      transcriptTrim.length >= 8;
    if (!passes) return { ok: false };

    const latinLetters = (trimmed.match(/[a-z]/gi) || []).length;
    if (latinLetters >= 12 && wordishTokens <= 2) {
      const vowels = (trimmed.match(/[aeiou]/gi) || []).length;
      const vowelRatio = latinLetters ? vowels / latinLetters : 0;
      let maxRun = 0;
      let currentRun = 0;
      for (const char of trimmed.toLowerCase()) {
        if (/[a-z]/.test(char)) {
          if (/[aeiou]/.test(char)) {
            currentRun = 0;
          } else {
            currentRun += 1;
            maxRun = Math.max(maxRun, currentRun);
          }
        } else {
          currentRun = 0;
        }
      }
      if (maxRun >= 7 || vowelRatio < 0.2) return { ok: false };
    }

    return { ok: true };
  };

  const startStructuring = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setGuardrailMessage('Need 1–2 more details to build a useful YapMap.');
      return;
    }
    setGuardrailMessage(null);

    if (isGuest && guestLimitReached()) {
      console.log('[guest] limit reached');
      setShowGuestLimitModal(true);
      markGuestLimitAck();
      return;
    }

    const clientValidation = validateCapture(trimmed, voiceUsed, lastTranscript);
    if (!clientValidation.ok) {
      setGuardrailMessage('Need 1–2 more details to build a useful YapMap.');
      return;
    }
    const totalStart = Date.now();

    setLimitReached(false);
    if (isGuest && !canCreateGuestProject()) {
        setLimitReached(true);
        return;
    }

    setIsProcessing(true);
    setError(null);

    const serverValidation = await validateCaptureAction(trimmed, voiceUsed, lastTranscript);
    if (!serverValidation.ok) {
      setIsProcessing(false);
      setGuardrailMessage('Need 1–2 more details to build a useful YapMap.');
      return;
    }

    setStep('structuring');
    startProgress();

    const id = draftId || uuidv4();
    setDraftId(id);
    const clientId = uuidv4();

    const draft: Project = {
      id,
      client_id: clientId,
      name: 'New Project',
      description: '',
      rootNode: {
        id: uuidv4(),
        title: 'Start of conversation',
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

    const dbStart = Date.now();
    await saveProject(draft);
    console.log('[capture] db_ms', Date.now() - dbStart);
    await advanceStage();
    if (isGuest) {
      setLimitReached(false);
    }

    try {
      const browserKey = getBrowserApiKey();
      const clientId = getClientId();
      let bundles: null | {
        buckets: StructuredBuckets;
        tree: TreeNode;
        router: ScenarioRouterResult;
        objectionHandlers: Record<string, TreeNode>;
      } = null;
      try {
        const bundleResult = await generateProjectBundleAction(
          trimmed,
          browserKey || undefined,
          clientId,
          { voiceUsed, transcript: lastTranscript }
        );
        if (bundleResult && 'ok' in bundleResult && !bundleResult.ok) {
          setGuardrailMessage('Need 1–2 more details to build a useful YapMap.');
          setIsProcessing(false);
          setStep('capture');
          return;
        }
        if (bundleResult && 'ok' in bundleResult && bundleResult.ok) {
          bundles = bundleResult;
        }
      } catch (e) {
        console.warn('[capture] bundle failed, falling back', e);
      }

      const router = bundles?.router || await routeScenarioAction(trimmed, browserKey || undefined, clientId);
      await advanceStage();
      const buckets = bundles?.buckets || await extractStructuredBucketsAction(trimmed, router, browserKey || undefined, clientId);
      await advanceStage();
      const tree = bundles?.tree || await generateTreeFromBucketsAction(buckets, router, browserKey || undefined, clientId);
      await advanceStage();
      const objectionHandlers = bundles?.objectionHandlers || await generateObjectionHandlersAction(router, buckets, browserKey || undefined, clientId);
      const objectionsPayload = bundles?.buckets?.objections
        ? { objections: bundles.buckets.objections, objectionsFallback: bundles.buckets.objectionsFallback || false }
        : await generateScenarioObjectionsAction(router, buckets, browserKey || undefined, clientId);
      const title = (buckets.title || `${buckets.stakeholder} — ${buckets.goal}`).trim() || 'New Project';
      const updated: Project = {
        ...draft,
        name: title,
        description: buckets.context || trimmed,
        rootNode: tree,
        structured: {
          ...buckets,
          rawCapture: trimmed,
          title,
          router,
          objectionHandlers,
          objections: objectionsPayload.objections,
          objectionsFallback: objectionsPayload.objectionsFallback,
        },
      };
      const dbEndStart = Date.now();
      await saveProject(updated);
      if (isGuest) {
        upsertGuestProject(updated);
      }
      console.log('[capture] db_ms', Date.now() - dbEndStart);
      finishProgress();
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('pwa_nudge_trigger', '1');
      }
      onComplete(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to structure project');
      setStep('capture');
      resetProgress();
    } finally {
      setIsProcessing(false);
      console.log('[capture] total_ms', Date.now() - totalStart);
    }
  };

  const handleClose = () => {
    stopRecording(false);
    onClose?.();
  };

  const handleChip = (label: string) => {
    setCaptureText((prev) => (prev ? `${prev}\n${label}` : label));
    setGuardrailMessage(null);
  };

  const applyTemplate = () => {
    const template = "Who I'm talking to:\nSituation:\nWhat I want:";
    setCaptureText((prev) => (prev ? `${prev}\n\n${template}` : template));
    setGuardrailMessage(null);
  };

  const handleGuestGoogle = async () => {
    if (!supabase?.auth) return;
    if (typeof window !== 'undefined') {
      localStorage.setItem('yapmap-auth-redirect', '/app');
    }
    const origin = window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    });
  };

  const showMicPulse = !captureText.trim() && !isListening;

  return (
    <>
      {title && <h2 className="modal-title">{title}</h2>}
      {step === 'capture' ? (
        <>
          <div className="capture-body">
            {showCaptureHeader && (
              <div className="capture-input-header">
                <div className="capture-input-label">Describe the situation</div>
                <div className="capture-input-micro">Type or dictate — 20–60 seconds is enough.</div>
              </div>
            )}
            <div className="capture-textarea-wrap">
              <label htmlFor={textareaId} className="sr-only">
                Describe the situation
              </label>
              <textarea
                id={textareaId}
                className="capture-textarea"
                value={captureText}
                onChange={(e) => {
                  setCaptureText(e.target.value);
                  setGuardrailMessage(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    startStructuring(captureText);
                  }
                }}
                placeholder={placeholder}
                rows={4}
              />
              <button
                type="button"
                className={`capture-mic-inline ${isListening ? 'is-listening' : ''}${showMicPulse ? ' demo-mic' : ''}`}
                onClick={() => toggleListening()}
                disabled={isProcessing}
                aria-label={isListening ? 'Tap again to stop' : 'Tap to yap'}
                title={isListening ? 'Tap again to stop' : 'Tap to yap'}
              >
                {isListening ? '◼' : '🎤'}
              </button>
            </div>
            {showVoiceHint && (
              <div className="capture-voice-hint">
                {isListening ? 'Tap again to stop' : 'Tap to yap'}
                {isListening && <span className="capture-recording">Recording…</span>}
              </div>
            )}
            {guardrailMessage && (
              <div className="card capture-guardrail">
                <div className="capture-guardrail-title">{guardrailMessage}</div>
                <div className="capture-guardrail-chips">
                  {['Who is it with?', 'What happened?', "What's your goal?"].map((label) => (
                    <button
                      key={label}
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleChip(label)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={applyTemplate}
                >
                  Use a quick template
                </button>
              </div>
            )}
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
      )}
      {showGuestLimitModal && (
        <div className="modal-overlay" onClick={() => setShowGuestLimitModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Create a free account to save more</h2>
            <p className="text-muted">
              Signing up is completely free. You’ll keep your current YapMap and unlock unlimited maps + sync.
            </p>
            <div className="flex flex-col gap-sm mt-md">
              <button className="btn btn-google w-full" onClick={handleGuestGoogle}>
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
              <Link href="/login?redirect=/app" className="btn btn-secondary w-full">
                Continue with email
              </Link>
              <button className="btn btn-secondary w-full" onClick={() => setShowGuestLimitModal(false)}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
