'use server';

import OpenAI from 'openai';
import { headers } from 'next/headers';
import { TreeNode, CallSummary, StructuredBuckets, ScenarioRouterResult, ScenarioType } from './types';
import { v4 as uuidv4 } from 'uuid';

// Helper: Add unique IDs and sentiments to all nodes in a tree
function addIdsToTree(node: any): TreeNode {
    return {
        id: node.id || uuidv4(),
        title: node.title || 'Untitled',
        talkingPoints: node.talkingPoints || [],
        questions: node.questions || [],
        sentiment: node.sentiment,
        children: (node.children || []).map(addIdsToTree),
    };
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

function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item) => String(item)).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
        return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return [];
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
    const ip = await getRequestIp();
    if (ip) {
        consumeRateLimit(`ip:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    }
    if (clientId) {
        consumeRateLimit(`client:${clientId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    }
}

function buildTreeSystemPrompt(router?: ScenarioRouterResult, buckets?: Partial<StructuredBuckets>) {
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
- Create 2-4 children per node unless it is an explicit end state
- Neutral branches must keep momentum with a follow-up question or next step
- Keep titles SHORT (max ~40 chars)
- Make talking points actionable and natural-sounding`;
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
    return {
        scenario_type: normalizeScenarioType(parsed.scenario_type),
        goal: parsed.goal || '',
        stakeholder: parsed.stakeholder || '',
        tone: parsed.tone || '',
        constraints: toStringArray((parsed as any).constraints),
        success_criteria: toStringArray((parsed as any).success_criteria),
        taboo: toStringArray((parsed as any).taboo),
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
    return addIdsToTree(parsed);
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
    return addIdsToTree(parsed);
}

export async function structureProjectAction(
    capture: string,
    userApiKey?: string,
    clientId?: string
): Promise<{ buckets: StructuredBuckets; tree: TreeNode; router: ScenarioRouterResult }> {
    await enforceRateLimit(clientId);
    const router = await routeScenarioAction(capture, userApiKey, clientId);
    const buckets = await extractStructuredBuckets(capture, userApiKey, router);
    const tree = await generateTreeFromBuckets(buckets, userApiKey, router);
    return { buckets, tree, router };
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
    userApiKey?: string,
    clientId?: string
): Promise<TreeNode[]> {
    await enforceRateLimit(clientId);
    const client = getOpenAIClient(userApiKey);
    const scenarioContext = buildScenarioContext(router);

    const systemPrompt = `Generate 2-4 next moves for the current node.
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
    const nodes = Array.isArray(parsed) ? parsed : parsed.nodes || [];
    return (nodes as TreeNode[]).map(addIdsToTree);
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
