'use server';

import OpenAI from 'openai';
import { z } from 'zod';
import { headers } from 'next/headers';
import { TreeNode, CallSummary, StructuredBuckets, ScenarioRouterResult, ScenarioType, ScenarioCategory, NodeSentiment } from './types';
import { v4 as uuidv4 } from 'uuid';

function toStringArraySafe(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item) => String(item)).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
        return [value.trim()];
    }
    return [];
}

// Helper: Normalize nodes (ids, arrays, sayNow/askNext aliases)
function normalizeNode(input: any): TreeNode {
    const childrenRaw = Array.isArray(input?.children)
        ? input.children
        : input?.children
            ? [input.children]
            : [];
    const talkingPoints = toStringArraySafe(input?.talkingPoints ?? input?.sayNow);
    const questions = toStringArraySafe(input?.questions ?? input?.askNext);
    return {
        id: typeof input?.id === 'string' ? input.id : uuidv4(),
        title: typeof input?.title === 'string' && input.title.trim() ? input.title : 'Untitled',
        talkingPoints,
        questions,
        sentiment: input?.sentiment,
        children: childrenRaw.map(normalizeNode),
    };
}

// Helper: Add unique IDs and sentiments to all nodes in a tree
function addIdsToTree(node: any): TreeNode {
    return normalizeNode(node);
}

function getOpenAIClient(userApiKey?: string): OpenAI {
    const apiKey = userApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OpenAI API Key is not configured. Please add it in Settings.');
    }
    return new OpenAI({ apiKey });
}

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const REQUIRED_SENTIMENTS: NodeSentiment[] = ['positive', 'neutral', 'negative'];
const LETTER_SPACE_LETTER = /\p{L}+\s+\p{L}+/u;

type CaptureValidationResult = { ok: true } | { ok: false; reason: 'need_more_context' };

const NodeSchema: z.ZodType<any> = z.object({
    id: z.string().optional(),
    title: z.string().optional(),
    sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
    talkingPoints: z.array(z.string()).optional(),
    questions: z.array(z.string()).optional(),
    sayNow: z.array(z.string()).optional(),
    askNext: z.array(z.string()).optional(),
    children: z.array(z.lazy(() => NodeSchema)).optional(),
}).passthrough();

const ObjectionsSchema = z.array(z.string().min(1).max(40)).min(4).max(8);

const ProjectBundleSchema = z.object({
    title: z.string().optional(),
    goal: z.string().optional(),
    stakeholder: z.string().optional(),
    context: z.string().optional(),
    decisionFrame: z.string().optional(),
    tone: z.string().optional(),
    scenario_type: z.enum([
        'salary_negotiation',
        'neighbor_conflict',
        'sales_call',
        'partnership',
        'interview',
        'performance_feedback',
        'personal_boundary',
        'other',
    ]).optional(),
    scenario_category: z.enum([
        'sales_partnership',
        'salary_negotiation',
        'customer_escalation',
        'personal_boundary',
        'relationship_conversation',
        'general_tough_conversation',
    ]).optional(),
    root: NodeSchema.optional(),
    objections: z.array(z.string().min(1).max(40)).min(4).max(8).optional(),
    objectionHandlers: z.record(z.string(), NodeSchema).optional(),
}).passthrough();

const SCENARIO_TREE_TEMPLATES: Record<ScenarioType, string> = {
    salary_negotiation: `Focus on compensation bands, scope, performance, timing, and trade-offs. Keep language professional, data-backed, and non-confrontational.`,
    neighbor_conflict: `Prioritize de-escalation, empathy, shared solutions, and respectful boundaries. Avoid legal threats or shaming tone.`,
    sales_call: `Emphasize discovery, value articulation, ROI, risk reduction, and buying process clarity.`,
    partnership: `Center mutual value, alignment, scope, timelines, and joint success metrics. Keep collaborative tone.`,
    interview: `Focus on role fit, evidence, expectations, timeline, and next steps. Keep confident, curious tone.`,
    performance_feedback: `Use clear observations, impact, and growth framing. Keep it constructive and specific.`,
    personal_boundary: `Use "I" statements, clarity, and calm boundaries. Offer alternatives and space for response.`,
    other: `Keep it practical, calm, and forward-moving. Avoid generic sales patterns.`,
};

const SCENARIO_PANIC_TEMPLATES: Record<ScenarioType, string> = {
    salary_negotiation: `Include options about budget limits, timing, scope changes, market data, total comp, and HR policy.`,
    neighbor_conflict: `Include options for apology, clarification, compromise, boundaries, and practical next steps.`,
    sales_call: `Include options for value clarification, budget/timeline, authority, and proof points.`,
    partnership: `Include options for scope alignment, mutual value, timeline, and risk mitigation.`,
    interview: `Include options for clarifying expectations, examples, and next steps.`,
    performance_feedback: `Include options for clarifying impact, expectations, and growth plan.`,
    personal_boundary: `Include options for restating boundaries, empathy, and offering alternatives.`,
    other: `Keep options grounded, respectful, and actionable.`,
};

function normalizeScenarioType(value: string | undefined): ScenarioType {
    const allowed: ScenarioType[] = [
        'salary_negotiation',
        'neighbor_conflict',
        'sales_call',
        'partnership',
        'interview',
        'performance_feedback',
        'personal_boundary',
        'other',
    ];
    if (value && allowed.includes(value as ScenarioType)) {
        return value as ScenarioType;
    }
    return 'other';
}

function normalizeScenarioCategory(value: string | undefined, scenarioType?: ScenarioType): ScenarioCategory {
    const allowed: ScenarioCategory[] = [
        'sales_partnership',
        'salary_negotiation',
        'customer_escalation',
        'personal_boundary',
        'relationship_conversation',
        'general_tough_conversation',
    ];
    if (value && allowed.includes(value as ScenarioCategory)) {
        return value as ScenarioCategory;
    }
    switch (scenarioType) {
        case 'sales_call':
        case 'partnership':
            return 'sales_partnership';
        case 'salary_negotiation':
            return 'salary_negotiation';
        case 'neighbor_conflict':
        case 'personal_boundary':
            return 'personal_boundary';
        case 'interview':
        case 'performance_feedback':
            return 'general_tough_conversation';
        default:
            return 'general_tough_conversation';
    }
}

function getScenarioCategory(router?: ScenarioRouterResult): ScenarioCategory {
    return normalizeScenarioCategory(router?.scenario_category, router?.scenario_type);
}

function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item) => String(item)).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
        return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return [];
}

function countWordishTokens(text: string): number {
    return text
        .split(/\s+/)
        .filter((token) => /\p{L}{2,}/u.test(token))
        .length;
}

function getMaxConsonantRun(text: string): number {
    let maxRun = 0;
    let currentRun = 0;
    const lower = text.toLowerCase();
    for (const char of lower) {
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
    return maxRun;
}

function validateCaptureInput(
    text: string,
    voiceUsed?: boolean,
    transcript?: string
): CaptureValidationResult {
    const trimmed = text.trim();
    const transcriptTrim = (transcript || '').trim();
    if (!trimmed) return { ok: false, reason: 'need_more_context' };
    if (voiceUsed && transcriptTrim.length < 8) return { ok: false, reason: 'need_more_context' };

    const wordishTokens = countWordishTokens(trimmed);
    const passes =
        (trimmed.length >= 12 && wordishTokens >= 2) ||
        LETTER_SPACE_LETTER.test(trimmed) ||
        transcriptTrim.length >= 8;
    if (!passes) return { ok: false, reason: 'need_more_context' };

    const latinLetters = (trimmed.match(/[a-z]/gi) || []).length;
    if (latinLetters >= 12 && wordishTokens <= 2) {
        const vowels = (trimmed.match(/[aeiou]/gi) || []).length;
        const vowelRatio = latinLetters ? vowels / latinLetters : 0;
        const maxConsonantRun = getMaxConsonantRun(trimmed);
        if (maxConsonantRun >= 7 || vowelRatio < 0.2) {
            return { ok: false, reason: 'need_more_context' };
        }
    }

    return { ok: true };
}

export async function validateCaptureAction(
    text: string,
    voiceUsed?: boolean,
    transcript?: string
): Promise<CaptureValidationResult> {
    return validateCaptureInput(text, voiceUsed, transcript);
}

function normalizeObjections(input: unknown): string[] {
    const list = toStringArraySafe(input)
        .map((label) => label.trim())
        .filter(Boolean)
        .filter((label) => label.length <= 40 && label.toLowerCase() !== 'other...');
    const unique = Array.from(new Set(list));
    return unique.slice(0, 8);
}

function validateObjections(input: unknown): { valid: boolean; value: string[] } {
    const normalized = normalizeObjections(input);
    const parsed = ObjectionsSchema.safeParse(normalized);
    return parsed.success ? { valid: true, value: parsed.data } : { valid: false, value: normalized };
}

function buildScenarioContext(router?: ScenarioRouterResult, fallback?: Partial<StructuredBuckets>) {
    const scenarioType = normalizeScenarioType(router?.scenario_type);
    return {
        scenarioType,
        goal: router?.goal || fallback?.goal || '',
        stakeholder: router?.stakeholder || fallback?.stakeholder || '',
        tone: router?.tone || fallback?.tone || '',
        constraints: router?.constraints || [],
        successCriteria: router?.success_criteria || [],
        taboo: router?.taboo || [],
    };
}

async function getRequestIp(): Promise<string | null> {
    const headerList = await headers();
    const forwarded = headerList.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0]?.trim() || null;
    return headerList.get('x-real-ip');
}

function consumeRateLimit(key: string, max: number, windowMs: number) {
    const now = Date.now();
    const record = rateLimitStore.get(key);
    if (!record || record.resetAt < now) {
        rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
        return;
    }
    if (record.count >= max) {
        throw new Error('Rate limit exceeded. Please try again later.');
    }
    record.count += 1;
    rateLimitStore.set(key, record);
}

async function enforceRateLimit(clientId?: string) {
    if (process.env.NODE_ENV !== 'production') return;
    const ip = await getRequestIp();
    if (ip) {
        consumeRateLimit(`ip:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    }
    if (clientId) {
        consumeRateLimit(`client:${clientId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    }
}

function buildTreeSystemPrompt(
    router?: ScenarioRouterResult,
    buckets?: Partial<StructuredBuckets>,
    strictSentiments?: boolean
) {
    const scenarioContext = buildScenarioContext(router, buckets);
    const scenarioNote = SCENARIO_TREE_TEMPLATES[scenarioContext.scenarioType];
    return `You are an expert call strategist. Generate a decision tree for handling different conversation paths.
Scenario type: ${scenarioContext.scenarioType}
Guidance: ${scenarioNote}

Context:
- Goal: ${scenarioContext.goal}
- Stakeholder: ${scenarioContext.stakeholder}
- Tone: ${scenarioContext.tone}
- Constraints: ${scenarioContext.constraints.join('; ') || 'None'}
- Success criteria: ${scenarioContext.successCriteria.join('; ') || 'None'}
- Taboo: ${scenarioContext.taboo.join('; ') || 'None'}

Output a JSON object with this structure:
{
  "title": "Root greeting/opening",
  "talkingPoints": ["Point 1 to say", "Point 2 to say"],
  "questions": ["Discovery question 1?", "Discovery question 2?"],
  "children": [
    {
      "title": "Possible response scenario",
      "talkingPoints": ["What to say in this case"],
      "questions": ["Follow-up discovery question?"],
      "sentiment": "positive",
      "children": [...]
    }
  ]
}

IMPORTANT RULES:
- Each node SHOULD have a "sentiment": "positive", "neutral", or "negative"
- Each node MUST have 1-3 "questions"
- Every node MUST include 3 counterpart response branches: one positive, one neutral, one negative
- Neutral branches must keep momentum with a follow-up question or next step
- Keep titles SHORT (max ~40 chars)
- Make talking points actionable and natural-sounding
${strictSentiments ? '- If you cannot comply, still output 3 children with one of each sentiment per node.' : ''}`;
}

function hasAllSentiments(children: TreeNode[]) {
    const present = new Set(children.map((child) => child.sentiment).filter(Boolean));
    return REQUIRED_SENTIMENTS.every((sentiment) => present.has(sentiment));
}

function treeHasSentimentCoverage(node: TreeNode): boolean {
    if (node.children.length === 0) return false;
    if (!hasAllSentiments(node.children)) return false;
    return node.children.every(treeHasSentimentCoverage);
}

function fallbackSentimentNode(sentiment: NodeSentiment): TreeNode {
    const titleMap: Record<NodeSentiment, string> = {
        positive: 'Positive response',
        neutral: 'Neutral response',
        negative: 'Pushback',
    };
    const talkMap: Record<NodeSentiment, string[]> = {
        positive: ['Acknowledge the alignment and move forward.'],
        neutral: ['Stay curious and keep momentum.'],
        negative: ['Acknowledge concerns and invite specifics.'],
    };
    const questionMap: Record<NodeSentiment, string[]> = {
        positive: ['What would make this a clear yes?'],
        neutral: ['What would you want to see next?'],
        negative: ['What’s the biggest concern right now?'],
    };
    return {
        id: uuidv4(),
        title: titleMap[sentiment],
        talkingPoints: talkMap[sentiment],
        questions: questionMap[sentiment],
        sentiment,
        children: [],
    };
}

function ensureSentimentBranches(node: TreeNode): TreeNode {
    const children = node.children.map(ensureSentimentBranches);
    const present = new Set(children.map((child) => child.sentiment).filter(Boolean));
    const missing = REQUIRED_SENTIMENTS.filter((sentiment) => !present.has(sentiment));
    const injected = missing.map((sentiment) => fallbackSentimentNode(sentiment));
    return {
        ...node,
        children: [...children, ...injected],
    };
}

function getDefaultObjections(category: ScenarioCategory): string[] {
    switch (category) {
        case 'sales_partnership':
            return [
                'Budget',
                'Timing / not a priority',
                'Need approval',
                'Already using competitor',
                "Don't see value / unclear ROI",
                'Too much effort to implement',
                'Trust / credibility',
                'Send info (stall)',
                'Other...',
            ];
        case 'salary_negotiation':
            return [
                'Budget / comp freeze',
                'Not the right time',
                'Performance expectations not met',
                'Need more scope/impact',
                'Internal equity / bands',
                "Let's revisit later",
                'Non-monetary benefits instead',
                'Headcount / org constraints',
                'Other...',
            ];
        case 'customer_escalation':
            return [
                'Unhappy / unacceptable',
                'Threatening to churn',
                'Price too high for value',
                'Trust broken / past issues',
                'Need immediate fix',
                'Want refund/credit',
                'Need executive attention',
                'Other...',
            ];
        case 'personal_boundary':
            return [
                'Didn’t realize it was loud',
                'Defensive (I have rights)',
                'Minimizes the issue',
                'Emotional / stressed',
                'Practical constraints',
                'Counter-complaint',
                'I’ll try (non-committal)',
                'Other...',
            ];
        case 'relationship_conversation':
            return [
                'Feeling attacked/defensive',
                'Avoiding / shutting down',
                'You’re overreacting',
                'Misunderstanding / different needs',
                'Emotional overwhelm',
                'Trust issue / past hurt',
                'Practical constraints',
                'Other...',
            ];
        default:
            return [
                'Denial / disagreement on facts',
                'Defensive / blame shifting',
                'Emotional overwhelm',
                'Avoidance / delay',
                'Trust / credibility',
                'Different priorities',
                'Other...',
            ];
    }
}

async function repairBundleJSON(raw: string, userApiKey?: string) {
    const client = getOpenAIClient(userApiKey);
    const systemPrompt = `You are a JSON repair assistant. Return only valid JSON matching this schema:
{
  "title": string,
  "goal": string,
  "stakeholder": string,
  "context": string,
  "decisionFrame": string,
  "tone": string,
  "scenario_type": "salary_negotiation" | "neighbor_conflict" | "sales_call" | "partnership" | "interview" | "performance_feedback" | "personal_boundary" | "other",
  "scenario_category": "sales_partnership" | "salary_negotiation" | "customer_escalation" | "personal_boundary" | "relationship_conversation" | "general_tough_conversation",
  "root": { "title": string, "talkingPoints"?: string[], "sayNow"?: string[], "questions"?: string[], "askNext"?: string[], "sentiment"?: "positive"|"neutral"|"negative", "children"?: [] },
  "objections": string[],
  "objectionHandlers": { "Label": { "title": string, "talkingPoints"?: string[], "questions"?: string[], "sentiment"?: "negative", "children"?: [] } }
}
Constraints:
- objections: 4-8 items, each <= 40 chars, no "Other..."
Fix the JSON from the user and return only the repaired JSON.`;

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: raw }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
    });
    return response.choices[0]?.message?.content || '';
}

async function generateObjectionsOnly(
    router: ScenarioRouterResult,
    buckets: Partial<StructuredBuckets>,
    userApiKey?: string
): Promise<string[]> {
    const client = getOpenAIClient(userApiKey);
    const scenario = buildScenarioContext(router, buckets);
    const systemPrompt = `Generate a concise list of scenario-specific objections.
Return JSON only: { "objections": ["short label", "..."] }
Rules:
- 4 to 8 items total
- Each label <= 40 characters
- No generic filler
- Do NOT include "Other..."`;

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `Scenario type: ${scenario.scenarioType}
Goal: ${scenario.goal}
Stakeholder: ${scenario.stakeholder}
Tone: ${scenario.tone}
Constraints: ${scenario.constraints.join('; ') || 'None'}
Success criteria: ${scenario.successCriteria.join('; ') || 'None'}
Taboo: ${scenario.taboo.join('; ') || 'None'}`
            }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');
    const parsed = JSON.parse(content) as { objections?: string[] };
    return normalizeObjections(parsed.objections);
}

function normalizeBundle(
    parsed: any,
    capture: string,
    objectionsOverride?: string[],
    objectionsFallback?: boolean
) {
    const routerType = normalizeScenarioType(parsed?.scenario_type);
    const routerCategory = normalizeScenarioCategory(parsed?.scenario_category, routerType);
    const router: ScenarioRouterResult = {
        scenario_type: routerType,
        scenario_category: routerCategory,
        goal: parsed?.goal || '',
        stakeholder: parsed?.stakeholder || '',
        tone: parsed?.tone || '',
        constraints: toStringArray((parsed as any)?.constraints),
        success_criteria: toStringArray((parsed as any)?.success_criteria),
        taboo: toStringArray((parsed as any)?.taboo),
    };

    const normalizedObjections = objectionsOverride || normalizeObjections(parsed?.objections);
    const hasValidObjections = normalizedObjections.length >= 4;
    const fallbackObjections = getDefaultObjections(routerCategory).filter((label) => label !== 'Other...');
    const finalObjections = hasValidObjections ? normalizedObjections : fallbackObjections;
    const fallbackFlag = objectionsFallback || !hasValidObjections;

    const buckets: StructuredBuckets = {
        goal: parsed?.goal || '',
        stakeholder: parsed?.stakeholder || '',
        context: parsed?.context || capture,
        decisionFrame: parsed?.decisionFrame || '',
        tone: parsed?.tone || '',
        title: parsed?.title || '',
        rawCapture: capture,
        objections: finalObjections,
        objectionsFallback: fallbackFlag,
    };

    const rootSource = parsed?.root || parsed?.tree || parsed;
    const tree = ensureSentimentBranches(addIdsToTree(rootSource));

    const labels = getDefaultObjections(routerCategory);
    const handlersRaw = parsed?.objectionHandlers || {};
    const normalizedHandlers: Record<string, TreeNode> = {};
    for (const label of labels) {
        if (label === 'Other...') continue;
        const handler = handlersRaw[label]
            ? ensureSentimentBranches(addIdsToTree(handlersRaw[label]))
            : fallbackSentimentNode('negative');
        normalizedHandlers[label] = handler;
    }

    return {
        router,
        buckets,
        tree,
        objectionHandlers: normalizedHandlers,
        objections: finalObjections,
        objectionsFallback: fallbackFlag,
    };
}

export async function routeScenarioAction(
    capture: string,
    userApiKey?: string,
    clientId?: string
): Promise<ScenarioRouterResult> {
    await enforceRateLimit(clientId);
    const client = getOpenAIClient(userApiKey);

    const systemPrompt = `You are a scenario router. Based on the raw capture, return JSON only with:
{
  "scenario_type": "salary_negotiation" | "neighbor_conflict" | "sales_call" | "partnership" | "interview" | "performance_feedback" | "personal_boundary" | "other",
  "scenario_category": "sales_partnership" | "salary_negotiation" | "customer_escalation" | "personal_boundary" | "relationship_conversation" | "general_tough_conversation",
  "goal": "short goal statement",
  "stakeholder": "who they are talking to",
  "tone": "desired tone",
  "constraints": ["constraint 1", "constraint 2"],
  "success_criteria": ["success metric 1", "success metric 2"],
  "taboo": ["do not say/do", "avoid topic"]
}

Use arrays (can be empty). Be concise, grounded, and avoid sales assumptions unless clearly present.`;

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: capture }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');

    const parsed = JSON.parse(content) as Partial<ScenarioRouterResult>;
    const scenarioType = normalizeScenarioType(parsed.scenario_type);
    return {
        scenario_type: scenarioType,
        scenario_category: normalizeScenarioCategory(parsed.scenario_category, scenarioType),
        goal: parsed.goal || '',
        stakeholder: parsed.stakeholder || '',
        tone: parsed.tone || '',
        constraints: toStringArray((parsed as any).constraints),
        success_criteria: toStringArray((parsed as any).success_criteria),
        taboo: toStringArray((parsed as any).taboo),
    };
}

export async function extractStructuredBucketsAction(
    capture: string,
    router: ScenarioRouterResult,
    userApiKey?: string,
    clientId?: string
): Promise<StructuredBuckets> {
    await enforceRateLimit(clientId);
    return extractStructuredBuckets(capture, userApiKey, router);
}

export async function generateTreeFromBucketsAction(
    buckets: StructuredBuckets,
    router: ScenarioRouterResult,
    userApiKey?: string,
    clientId?: string
): Promise<TreeNode> {
    await enforceRateLimit(clientId);
    return generateTreeFromBuckets(buckets, userApiKey, router);
}

export async function generateObjectionHandlersAction(
    router: ScenarioRouterResult,
    buckets: StructuredBuckets,
    userApiKey?: string,
    clientId?: string
): Promise<Record<string, TreeNode>> {
    await enforceRateLimit(clientId);
    const client = getOpenAIClient(userApiKey);
    const category = getScenarioCategory(router);
    const objections = getDefaultObjections(category).filter((label) => label !== 'Other...');

    const systemPrompt = `Generate objection handlers for the given list. For each objection label, output a node with:
- title (2-4 words)
- talkingPoints (1-2 short lines)
- questions (2 short questions)
- sentiment: "negative"
- children: exactly 3 child nodes (positive/neutral/negative)

Return JSON object:
{ "handlers": { "Label": { ...node }, ... } }`;

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `Scenario category: ${category}
Goal: ${buckets.goal}
Stakeholder: ${buckets.stakeholder}
Context: ${buckets.context}
Decision frame: ${buckets.decisionFrame}
Tone: ${buckets.tone || router.tone}

Objections: ${objections.join(', ')}`
            }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.6,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');
    const parsed = JSON.parse(content) as { handlers?: Record<string, TreeNode> };
    const handlers = parsed.handlers || {};
    const normalized: Record<string, TreeNode> = {};
    for (const [label, node] of Object.entries(handlers)) {
        const normalizedNode = ensureSentimentBranches(addIdsToTree(node));
        normalized[label] = normalizedNode;
    }
    return normalized;
}

export async function generateScenarioObjectionsAction(
    router: ScenarioRouterResult,
    buckets: StructuredBuckets,
    userApiKey?: string,
    clientId?: string
): Promise<{ objections: string[]; objectionsFallback: boolean }> {
    await enforceRateLimit(clientId);
    const category = getScenarioCategory(router);
    let objectionsFallback = false;
    let objections: string[] = [];
    try {
        objections = await generateObjectionsOnly(router, buckets, userApiKey);
        const validated = validateObjections(objections);
        if (!validated.valid) {
            objectionsFallback = true;
            objections = getDefaultObjections(category).filter((label) => label !== 'Other...');
        } else {
            objections = validated.value;
        }
    } catch (e) {
        console.warn('[objections] generation failed', e);
        objectionsFallback = true;
        objections = getDefaultObjections(category).filter((label) => label !== 'Other...');
    }
    return { objections, objectionsFallback };
}

export async function generateProjectBundleAction(
    capture: string,
    userApiKey?: string,
    clientId?: string,
    validationMeta?: { voiceUsed?: boolean; transcript?: string }
): Promise<
    | { ok: false; reason: 'need_more_context' }
    | { ok: true; buckets: StructuredBuckets; tree: TreeNode; router: ScenarioRouterResult; objectionHandlers: Record<string, TreeNode> }
> {
    const validation = validateCaptureInput(capture, validationMeta?.voiceUsed, validationMeta?.transcript);
    if (!validation.ok) {
        return validation;
    }
    await enforceRateLimit(clientId);
    const client = getOpenAIClient(userApiKey);
    const start = Date.now();

    const systemPrompt = `You are YapMap. Return ONE compact JSON response with:
- title, goal, stakeholder, context, decisionFrame, tone
- scenario_type + scenario_category
- root node with 3 children: positive, neutral, negative
- Each node includes 1-2 sayNow lines + 2-3 askNext questions
- Each node must include exactly 3 children with sentiments positive/neutral/negative
- objections: list of 4-8 scenario-specific labels (<= 40 chars each, no "Other...")
- objectionHandlers: map label -> node that handles the objection (sentiment "negative") with 3 children
Keep strings short. Limit arrays to max 2-3 items.

Return JSON with keys:
{
  "title": string,
  "goal": string,
  "stakeholder": string,
  "context": string,
  "decisionFrame": string,
  "tone": string,
  "scenario_type": "...",
  "scenario_category": "...",
  "root": { "title": "...", "sayNow": [], "askNext": [], "sentiment": "neutral", "children": [] },
  "objections": ["..."],
  "objectionHandlers": { "Label": { "title": "...", "sayNow": [], "askNext": [], "sentiment": "negative", "children": [] } }
}`;

    const userPrompt = `Raw capture: ${capture}`;

    const aiStart = Date.now();
    const stream = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.6,
        stream: true,
    });

    let raw = '';
    for await (const chunk of stream) {
        raw += chunk.choices[0]?.delta?.content || '';
    }
    console.log('[generateProjectBundleAction] ai_ms', Date.now() - aiStart);

    let parsed: any | null = null;
    try {
        parsed = JSON.parse(raw);
    } catch {
        parsed = null;
    }

    let bundleValidation = parsed ? ProjectBundleSchema.safeParse(parsed) : null;
    if (!bundleValidation || !bundleValidation.success) {
        const repaired = await repairBundleJSON(raw, userApiKey);
        try {
            const repairedParsed = JSON.parse(repaired);
            bundleValidation = ProjectBundleSchema.safeParse(repairedParsed);
            if (bundleValidation.success) {
                parsed = bundleValidation.data;
            }
        } catch {
            // noop
        }
    }

    if (!parsed) {
        throw new Error('Invalid AI output');
    }

    const scenarioType = normalizeScenarioType(parsed?.scenario_type);
    const scenarioCategory = normalizeScenarioCategory(parsed?.scenario_category, scenarioType);
    const routerSeed: ScenarioRouterResult = {
        scenario_type: scenarioType,
        scenario_category: scenarioCategory,
        goal: parsed?.goal || '',
        stakeholder: parsed?.stakeholder || '',
        tone: parsed?.tone || '',
        constraints: toStringArray((parsed as any)?.constraints),
        success_criteria: toStringArray((parsed as any)?.success_criteria),
        taboo: toStringArray((parsed as any)?.taboo),
    };
    const bucketsSeed: Partial<StructuredBuckets> = {
        goal: parsed?.goal || '',
        stakeholder: parsed?.stakeholder || '',
        context: parsed?.context || capture,
        decisionFrame: parsed?.decisionFrame || '',
        tone: parsed?.tone || '',
    };

    let objections = normalizeObjections(parsed?.objections);
    let objectionsFallback = false;
    const objectionsValidation = validateObjections(parsed?.objections);
    if (!objectionsValidation.valid) {
        console.warn('[objections] invalid, attempting repair');
        try {
            const repaired = await generateObjectionsOnly(routerSeed, bucketsSeed, userApiKey);
            const repairedValidated = validateObjections(repaired);
            if (repairedValidated.valid) {
                objections = repairedValidated.value;
            } else {
                objectionsFallback = true;
                objections = getDefaultObjections(scenarioCategory)
                    .filter((label) => label !== 'Other...');
            }
        } catch (e) {
            console.warn('[objections] repair failed', e);
            objectionsFallback = true;
            objections = getDefaultObjections(scenarioCategory)
                .filter((label) => label !== 'Other...');
        }
    } else {
        objections = objectionsValidation.value;
    }

    const normalized = normalizeBundle(parsed, capture, objections, objectionsFallback);
    console.log('[generateProjectBundleAction] total_ms', Date.now() - start);
    return {
        ok: true,
        buckets: normalized.buckets,
        tree: normalized.tree,
        router: normalized.router,
        objectionHandlers: normalized.objectionHandlers,
    };
}

// Generate a decision tree from a scenario description
export async function generateTreeAction(
    scenario: string,
    userApiKey?: string,
    clientId?: string,
    router?: ScenarioRouterResult
): Promise<TreeNode> {
    await enforceRateLimit(clientId);
    const client = getOpenAIClient(userApiKey);

    const systemPrompt = buildTreeSystemPrompt(router);

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Scenario: ${scenario}\n\nGenerate a decision tree for this call with discovery questions at each stage.` }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');

    const parsed = JSON.parse(content);
    const tree = addIdsToTree(parsed);
    if (treeHasSentimentCoverage(tree)) return tree;

    const strictPrompt = buildTreeSystemPrompt(router, undefined, true);
    const retry = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: strictPrompt },
            { role: 'user', content: `Scenario: ${scenario}\n\nGenerate a decision tree for this call with discovery questions at each stage.` }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
    });
    const retryContent = retry.choices[0]?.message?.content;
    if (!retryContent) return ensureSentimentBranches(tree);
    const retryTree = addIdsToTree(JSON.parse(retryContent));
    return treeHasSentimentCoverage(retryTree) ? retryTree : ensureSentimentBranches(retryTree);
}

async function extractStructuredBuckets(
    capture: string,
    userApiKey?: string,
    router?: ScenarioRouterResult
): Promise<StructuredBuckets> {
    const client = getOpenAIClient(userApiKey);
    const scenarioContext = buildScenarioContext(router);

    const systemPrompt = `Extract structured fields from the raw capture.
Return a JSON object with:
- goal: string
- stakeholder: string
- context: string
- decisionFrame: string (If they say X → I say Y)
Optional keys when clearly present:
- redFlags
- nonNegotiables
- tone
- title

Keep each field concise and clear.

Scenario context:
${JSON.stringify(scenarioContext)}`;

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: capture }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');

    const parsed = JSON.parse(content) as StructuredBuckets;
    return {
        goal: parsed.goal || '',
        stakeholder: parsed.stakeholder || '',
        context: parsed.context || '',
        decisionFrame: parsed.decisionFrame || '',
        redFlags: parsed.redFlags,
        nonNegotiables: parsed.nonNegotiables,
        tone: parsed.tone,
        title: parsed.title,
    };
}

async function generateTreeFromBuckets(
    buckets: StructuredBuckets,
    userApiKey?: string,
    router?: ScenarioRouterResult
): Promise<TreeNode> {
    const client = getOpenAIClient(userApiKey);

    const systemPrompt = buildTreeSystemPrompt(router, buckets);

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `Goal: ${buckets.goal}\nStakeholder: ${buckets.stakeholder}\nContext: ${buckets.context}\nDecision frame: ${buckets.decisionFrame}`
            }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');

    const parsed = JSON.parse(content);
    const tree = addIdsToTree(parsed);
    if (treeHasSentimentCoverage(tree)) return tree;

    const strictPrompt = buildTreeSystemPrompt(router, buckets, true);
    const retry = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: strictPrompt },
            {
                role: 'user',
                content: `Goal: ${buckets.goal}\nStakeholder: ${buckets.stakeholder}\nContext: ${buckets.context}\nDecision frame: ${buckets.decisionFrame}`
            }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
    });
    const retryContent = retry.choices[0]?.message?.content;
    if (!retryContent) return ensureSentimentBranches(tree);
    const retryTree = addIdsToTree(JSON.parse(retryContent));
    return treeHasSentimentCoverage(retryTree) ? retryTree : ensureSentimentBranches(retryTree);
}

export async function generateObjectionStep(
    objectionLabel: string,
    contextSummary: string,
    userApiKey?: string,
    clientId?: string
): Promise<{ title: string; sayThisNow: string[]; askNext: string[] }> {
    await enforceRateLimit(clientId);
    const client = getOpenAIClient(userApiKey);

    const systemPrompt = `You generate objection-specific talking points for a call.
Return JSON with:
{
  "title": "Handle: <objection>",
  "sayThisNow": ["short line 1", "short line 2"],
  "askNext": ["short question 1", "short question 2", "short question 3"]
}
Keep it brief, calm, and actionable.`;

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Objection: ${objectionLabel}\nContext: ${contextSummary}` }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');
    const parsed = JSON.parse(content) as { title?: string; sayThisNow?: string[]; askNext?: string[] };
    return {
        title: parsed.title || `Handle: ${objectionLabel}`,
        sayThisNow: toStringArraySafe(parsed.sayThisNow),
        askNext: toStringArraySafe(parsed.askNext),
    };
}

export async function structureProjectAction(
    capture: string,
    userApiKey?: string,
    clientId?: string,
    validationMeta?: { voiceUsed?: boolean; transcript?: string }
): Promise<
    | { ok: false; reason: 'need_more_context' }
    | { ok: true; buckets: StructuredBuckets; tree: TreeNode; router: ScenarioRouterResult; objectionHandlers: Record<string, TreeNode> }
> {
    const validation = validateCaptureInput(capture, validationMeta?.voiceUsed, validationMeta?.transcript);
    if (!validation.ok) {
        return validation;
    }
    await enforceRateLimit(clientId);
    const router = await routeScenarioAction(capture, userApiKey, clientId);
    const buckets = await extractStructuredBuckets(capture, userApiKey, router);
    const tree = await generateTreeFromBuckets(buckets, userApiKey, router);
    const objectionHandlers = await generateObjectionHandlersAction(router, buckets, userApiKey, clientId);
    return { ok: true, buckets, tree, router, objectionHandlers };
}

export async function regenerateBucketAction(
    bucketKey: keyof StructuredBuckets,
    capture: string,
    buckets: StructuredBuckets,
    userApiKey?: string,
    clientId?: string
): Promise<{ value: string; tree?: TreeNode }> {
    await enforceRateLimit(clientId);
    const client = getOpenAIClient(userApiKey);
    const systemPrompt = `Regenerate only the requested bucket based on the raw capture and current structured fields.
Return JSON: { "value": "..." }`;

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `Bucket: ${bucketKey}\nRaw capture: ${capture}\nCurrent fields: ${JSON.stringify(buckets)}`
            }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.6,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');

    const parsed = JSON.parse(content) as { value: string };
    const value = parsed.value || '';

    if (bucketKey === 'decisionFrame') {
        const nextBuckets = { ...buckets, decisionFrame: value };
        const tree = await generateTreeFromBuckets(nextBuckets, userApiKey, buckets.router);
        return { value, tree };
    }

    return { value };
}

// Refine a specific node with AI assistance
export async function refineNodeAction(
    node: TreeNode,
    instruction: string,
    context?: string,
    userApiKey?: string,
    clientId?: string
): Promise<TreeNode> {
    await enforceRateLimit(clientId);
    const client = getOpenAIClient(userApiKey);

    const systemPrompt = `You are helping refine a decision tree node for a business call.
The user will give you the current node and their instruction for how to improve it.

Output the improved node as JSON with this structure:
{
  "title": "Short title (2-5 words)",
  "talkingPoints": ["Point 1", "Point 2", ...],
  "questions": ["Discovery question 1?", "Discovery question 2?"],
  "sentiment": "positive" | "neutral" | "negative",
  "children": [...existing children or new ones...]
}

IMPORTANT: Include 1-3 discovery questions and an appropriate sentiment.
Keep the same ID if present. Only modify what the user requested.`;

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `Current node:\n${JSON.stringify(node, null, 2)}\n\n${context ? `Context: ${context}\n\n` : ''}Instruction: ${instruction}`
            }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');

    const parsed = JSON.parse(content);
    parsed.id = node.id;
    return addIdsToTree(parsed);
}

// Panic button: Handle unexpected objection
export async function handleObjectionAction(
    objectionType: string,
    currentNode: TreeNode,
    projectGoal?: string,
    router?: ScenarioRouterResult,
    lastMoveLabel?: string,
    userApiKey?: string,
    clientId?: string
): Promise<TreeNode[]> {
    await enforceRateLimit(clientId);
    const client = getOpenAIClient(userApiKey);
    const scenarioContext = buildScenarioContext(router);

    const systemPrompt = `You are helping handle an unexpected objection or moment during a call.
Generate 1 main response with 2-4 follow-up options as child nodes.
${SCENARIO_PANIC_TEMPLATES[scenarioContext.scenarioType]}

Output as JSON object with exactly 1 node that has 2-4 children:
{
  "nodes": [
    {
      "title": "Response to objection (2-5 words)",
      "talkingPoints": ["What to say to address this objection"],
      "questions": ["Discovery question to understand their concern better?"],
      "sentiment": "neutral",
      "children": [
        {
          "title": "If they accept",
          "talkingPoints": ["Follow-up point"],
          "questions": ["Question to move forward?"],
          "sentiment": "positive",
          "children": []
        },
        {
          "title": "If they push back",
          "talkingPoints": ["Alternative approach"],
          "questions": ["Question to dig deeper?"],
          "sentiment": "negative",
          "children": []
        }
      ]
    }
  ]
}

IMPORTANT:
- Be concise and actionable. Use short option titles (max ~40 chars).
- Neutral branches must keep momentum and include a next step.
- Avoid dead ends unless explicitly ending the call.
- Always assign appropriate sentiment.`;

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `Scenario type: ${scenarioContext.scenarioType}
Goal: ${projectGoal || scenarioContext.goal}
Stakeholder: ${scenarioContext.stakeholder}
Tone: ${scenarioContext.tone}
Constraints: ${scenarioContext.constraints.join('; ') || 'None'}
Success criteria: ${scenarioContext.successCriteria.join('; ') || 'None'}
Taboo: ${scenarioContext.taboo.join('; ') || 'None'}

Last move selected: ${lastMoveLabel || 'N/A'}
Current node title: ${currentNode.title}
Say-this points: ${currentNode.talkingPoints.join(' | ') || 'None'}
Questions: ${currentNode.questions.join(' | ') || 'None'}
Selected panic option: ${objectionType}

Generate a response node with discovery questions.`
            }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');

    const parsed = JSON.parse(content);
    const nodes = Array.isArray(parsed) ? parsed : parsed.nodes || [parsed];
    return nodes.map(addIdsToTree);
}

export async function getPanicOptionsAction(
    currentNode: TreeNode,
    projectGoal?: string,
    router?: ScenarioRouterResult,
    lastMoveLabel?: string,
    userApiKey?: string,
    clientId?: string
): Promise<{ title: string; description?: string }[]> {
    await enforceRateLimit(clientId);
    const client = getOpenAIClient(userApiKey);
    const scenarioContext = buildScenarioContext(router);

    const systemPrompt = `Generate 3-5 panic options tailored to the scenario and current node.
Each option should be a short, actionable title (max ~40 chars). Provide an optional 1-sentence description.
${SCENARIO_PANIC_TEMPLATES[scenarioContext.scenarioType]}

Return JSON object: { "options": [{ "title": "...", "description": "..." }] }`;

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `Scenario type: ${scenarioContext.scenarioType}
Goal: ${projectGoal || scenarioContext.goal}
Stakeholder: ${scenarioContext.stakeholder}
Tone: ${scenarioContext.tone}
Constraints: ${scenarioContext.constraints.join('; ') || 'None'}
Success criteria: ${scenarioContext.successCriteria.join('; ') || 'None'}
Taboo: ${scenarioContext.taboo.join('; ') || 'None'}

Last move selected: ${lastMoveLabel || 'N/A'}
Current node title: ${currentNode.title}
Say-this points: ${currentNode.talkingPoints.join(' | ') || 'None'}
Questions: ${currentNode.questions.join(' | ') || 'None'}`
            }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.6,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');

    const parsed = JSON.parse(content);
    const options = Array.isArray(parsed) ? parsed : parsed.options || [];
    return (options as Array<{ title?: string; description?: string }>)
        .map((opt) => ({
            title: opt.title?.trim() || '',
            description: opt.description?.trim() || undefined,
        }))
        .filter((opt) => opt.title);
}

export async function generateNextMovesAction(
    currentNode: TreeNode,
    projectGoal?: string,
    router?: ScenarioRouterResult,
    lastMoveLabel?: string,
    objectionHint?: string,
    userApiKey?: string,
    clientId?: string,
    useFallback?: boolean
): Promise<TreeNode[]> {
    await enforceRateLimit(clientId);
    const client = getOpenAIClient(userApiKey);
    const scenarioContext = buildScenarioContext(router);

    const systemPrompt = useFallback
        ? `Generate 3 next moves for the current node: one positive, one neutral, one negative.
Keep them generic, calm, and forward-moving. Avoid jargon.
Each move must be a short, actionable title (max ~40 chars) and include 1-2 "talkingPoints" and 1-2 "questions".
Return a JSON object using this structure:
{
  "nodes": [
    {
      "title": "Short option title",
      "talkingPoints": ["What to say"],
      "questions": ["Question to ask?"],
      "sentiment": "positive" | "neutral" | "negative",
      "children": []
    }
  ]
}`
        : `Generate 3 next moves for the current node: one positive, one neutral, one negative.
Each move must be a short, actionable title (max ~40 chars) and include 1-2 "talkingPoints" and 1-2 "questions".
Neutral branches must keep momentum and include a next step.
${SCENARIO_TREE_TEMPLATES[scenarioContext.scenarioType]}

Return a JSON object using this structure:
{
  "nodes": [
    {
      "title": "Short option title",
      "talkingPoints": ["What to say"],
      "questions": ["Question to ask?"],
      "sentiment": "positive" | "neutral" | "negative",
      "children": []
    }
  ]
}`;

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `Scenario type: ${scenarioContext.scenarioType}
Goal: ${projectGoal || scenarioContext.goal}
Stakeholder: ${scenarioContext.stakeholder}
Tone: ${scenarioContext.tone}
Constraints: ${scenarioContext.constraints.join('; ') || 'None'}
Success criteria: ${scenarioContext.successCriteria.join('; ') || 'None'}
Taboo: ${scenarioContext.taboo.join('; ') || 'None'}

Last move selected: ${lastMoveLabel || 'N/A'}
Objection hint: ${objectionHint || 'None'}
Current node title: ${currentNode.title}
Say-this points: ${currentNode.talkingPoints.join(' | ') || 'None'}
Questions: ${currentNode.questions.join(' | ') || 'None'}`
            }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');

    const parsed = JSON.parse(content);
    const nodes = (Array.isArray(parsed) ? parsed : parsed.nodes || []) as TreeNode[];
    const normalized = nodes.map(addIdsToTree);
    if (hasAllSentiments(normalized)) return normalized;
    if (!useFallback) {
        return generateNextMovesAction(
            currentNode,
            projectGoal,
            router,
            lastMoveLabel,
            objectionHint,
            userApiKey,
            clientId,
            true
        );
    }
    const present = new Set(normalized.map((node) => node.sentiment).filter(Boolean));
    const missing = REQUIRED_SENTIMENTS.filter((sentiment) => !present.has(sentiment));
    return [...normalized, ...missing.map(fallbackSentimentNode)];
}

export async function generateAskNextAction(
    currentNode: TreeNode,
    projectGoal?: string,
    router?: ScenarioRouterResult,
    lastMoveLabel?: string,
    userApiKey?: string,
    clientId?: string
): Promise<string[]> {
    await enforceRateLimit(clientId);
    const client = getOpenAIClient(userApiKey);
    const scenarioContext = buildScenarioContext(router);

    const systemPrompt = `Generate 2-3 concise "Ask next" questions for the current node.
Questions should keep momentum, be open-ended, and avoid dead ends.
${SCENARIO_TREE_TEMPLATES[scenarioContext.scenarioType]}

Return a JSON object: { "questions": ["...", "..."] }`;

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `Scenario type: ${scenarioContext.scenarioType}
Goal: ${projectGoal || scenarioContext.goal}
Stakeholder: ${scenarioContext.stakeholder}
Tone: ${scenarioContext.tone}
Constraints: ${scenarioContext.constraints.join('; ') || 'None'}
Success criteria: ${scenarioContext.successCriteria.join('; ') || 'None'}
Taboo: ${scenarioContext.taboo.join('; ') || 'None'}

Last move selected: ${lastMoveLabel || 'N/A'}
Current node title: ${currentNode.title}
Say-this points: ${currentNode.talkingPoints.join(' | ') || 'None'}`
            }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.6,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');

    const parsed = JSON.parse(content) as { questions?: string[] };
    return (parsed.questions || []).map((q) => q.trim()).filter(Boolean);
}

// Generate call summary from path taken
export async function generateCallSummaryAction(
    pathTitles: string[],
    projectDescription: string,
    userApiKey?: string,
    clientId?: string
): Promise<string> {
    await enforceRateLimit(clientId);
    const client = getOpenAIClient(userApiKey);

    const systemPrompt = `You are helping summarize a business call based on the conversation path that was taken.
Generate a brief, professional summary of what happened during the call.

Include:
- What was discussed (based on the path)
- Likely outcome/next steps
- Any key insights

Keep it concise - 3-5 sentences max.`;

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `Call context: ${projectDescription}\n\nConversation path taken:\n${pathTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nGenerate a brief call summary.`
            }
        ],
        temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');

    return content;
}

// Check if API key is configured on the server
export async function isServerApiKeyConfigured(): Promise<boolean> {
    return !!process.env.OPENAI_API_KEY;
}

// Transcribe audio file using Whisper
export async function transcribeAudioAction(
    formData: FormData,
    userApiKey?: string,
    clientId?: string
): Promise<string> {
    await enforceRateLimit(clientId);
    const file = formData.get('file') as File;
    if (!file) {
        throw new Error('No audio file provided');
    }

    const client = getOpenAIClient(userApiKey);

    const response = await client.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
    });

    return response.text;
}
