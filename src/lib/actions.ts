'use server';

import OpenAI from 'openai';
import { TreeNode, CallSummary, StructuredBuckets } from './types';
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

// Generate a decision tree from a scenario description
export async function generateTreeAction(scenario: string, userApiKey?: string): Promise<TreeNode> {
    const client = getOpenAIClient(userApiKey);

    const systemPrompt = `You are an expert sales strategist helping prepare for business calls. 
Generate a decision tree for handling different conversation paths.

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
      "sentiment": "positive", // Use "positive", "neutral", or "negative"
      "children": [...]
    }
  ]
}

IMPORTANT RULES:
- Each node SHOULD have a "sentiment": "positive" (green, progress), "neutral" (yellow, info-seeking), or "negative" (red, objection/blocker)
- Each node MUST have 1-3 "questions" - these are discovery questions to ask the client
- Questions should uncover needs, pain points, priorities, or decision criteria
- Make questions open-ended and insightful (not yes/no questions)
- Create 3-5 initial branches from the root, and 2-3 sub-branches for common paths
- Keep titles SHORT (2-5 words)
- Make talking points actionable and natural-sounding
- Focus on the most likely conversation paths and common objections`;

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

async function extractStructuredBuckets(capture: string, userApiKey?: string): Promise<StructuredBuckets> {
    const client = getOpenAIClient(userApiKey);

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

Keep each field concise and clear.`;

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
    userApiKey?: string
): Promise<TreeNode> {
    const client = getOpenAIClient(userApiKey);

    const systemPrompt = `You are an expert sales strategist. Generate a decision tree for a call using the structured fields.

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

IMPORTANT:
- Each node MUST include 1-3 discovery questions.
- Use sentiments: "positive", "neutral", or "negative".
- Keep titles short (2-5 words).
- Use Goal/Stakeholder/Context/Decision frame to shape branches.`;

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
    userApiKey?: string
): Promise<{ buckets: StructuredBuckets; tree: TreeNode }> {
    const buckets = await extractStructuredBuckets(capture, userApiKey);
    const tree = await generateTreeFromBuckets(buckets, userApiKey);
    return { buckets, tree };
}

export async function regenerateBucketAction(
    bucketKey: keyof StructuredBuckets,
    capture: string,
    buckets: StructuredBuckets,
    userApiKey?: string
): Promise<{ value: string; tree?: TreeNode }> {
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
        const tree = await generateTreeFromBuckets(nextBuckets, userApiKey);
        return { value, tree };
    }

    return { value };
}

// Refine a specific node with AI assistance
export async function refineNodeAction(
    node: TreeNode,
    instruction: string,
    context?: string,
    userApiKey?: string
): Promise<TreeNode> {
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
    projectContext?: string,
    userApiKey?: string
): Promise<TreeNode[]> {
    const client = getOpenAIClient(userApiKey);

    const systemPrompt = `You are helping handle an unexpected objection during a business call.
Generate 1 main response with 2 follow-up options as child nodes.

Output as a JSON array with exactly 1 node that has 2 children:
[
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

Be concise and actionable. Focus on professional, non-pushy responses. Always assign appropriate sentiment.`;

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `Objection type: ${objectionType}\nCurrent position in call: ${currentNode.title}\n${projectContext ? `Call context: ${projectContext}` : ''}\n\nGenerate a response node with discovery questions.`
            }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');

    const parsed = JSON.parse(content);
    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    return nodes.map(addIdsToTree);
}

// Generate call summary from path taken
export async function generateCallSummaryAction(
    pathTitles: string[],
    projectDescription: string,
    userApiKey?: string
): Promise<string> {
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
    userApiKey?: string
): Promise<string> {
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
