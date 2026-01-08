import { v4 as uuidv4 } from 'uuid';
import { ObjectionBundle, Project, TreeNode } from './types';

const makeBundle = (input: Partial<ObjectionBundle>): ObjectionBundle => ({
    primaryLine: input.primaryLine || '',
    diagnoseQuestion: input.diagnoseQuestion || '',
    responses: {
        soft: input.responses?.soft || '',
        direct: input.responses?.direct || '',
        challenger: input.responses?.challenger,
    },
    proof: input.proof,
    riskReset: input.riskReset,
    nextStep: input.nextStep || '',
    tags: input.tags || [],
    patternHints: input.patternHints,
    emotionVariants: input.emotionVariants,
});

const makeObjectionNode = (title: string, bundle: ObjectionBundle): TreeNode => ({
    id: uuidv4(),
    title,
    type: 'objection',
    talkingPoints: [],
    questions: [],
    objectionBundle: bundle,
    children: [],
});

export function getStefanPilotProject(): Project {
    const objections: TreeNode[] = [
        makeObjectionNode('Budget', makeBundle({
            primaryLine: 'Totally fair — budget is real.',
            diagnoseQuestion: 'What range feels reasonable for you right now?',
            responses: {
                soft: 'If budget is tight, we can scope a small pilot first.',
                direct: 'If we align on ROI, can we find a number that works?',
                challenger: 'Doing nothing has a cost — what’s that worth to you?',
            },
            proof: 'We’ve run low-risk pilots that paid back within a quarter.',
            riskReset: 'We can set a hard cap and stop if results miss.',
            nextStep: 'Open to a 2-week pilot with a clear cap?',
            tags: ['budget', 'risk', 'scope'],
        })),
        makeObjectionNode('Timing', makeBundle({
            primaryLine: 'Timing matters — no rush on your end.',
            diagnoseQuestion: 'What would make the timing feel right?',
            responses: {
                soft: 'We can plan now and start when your team is ready.',
                direct: 'If we pencil a date, can we hold a spot for you?',
            },
            proof: 'We’ve staged rollouts around busy seasons.',
            nextStep: 'Want to set a tentative start window?',
            tags: ['timing', 'capacity'],
        })),
        makeObjectionNode('Need approval', makeBundle({
            primaryLine: 'Makes sense — approvals take time.',
            diagnoseQuestion: 'Who else needs to feel good about this?',
            responses: {
                soft: 'Happy to send a short one-pager for them.',
                direct: 'Could we meet with them together this week?',
            },
            proof: 'We’ve supported stakeholder reviews with a simple deck.',
            nextStep: 'Can we schedule a quick stakeholder sync?',
            tags: ['stakeholders', 'process'],
        })),
        makeObjectionNode('ROI unclear', makeBundle({
            primaryLine: 'Let’s make the value clear together.',
            diagnoseQuestion: 'Which outcomes matter most to you?',
            responses: {
                soft: 'We can align on 1–2 metrics and track them.',
                direct: 'If we can show impact on those metrics, would you proceed?',
            },
            proof: 'Similar pilots lifted conversion by 12–18%.',
            nextStep: 'Can we pick the top metrics to measure?',
            tags: ['roi', 'metrics'],
        })),
        makeObjectionNode('Legal / compliance', makeBundle({
            primaryLine: 'Totally — compliance is non‑negotiable.',
            diagnoseQuestion: 'What’s the key compliance concern?',
            responses: {
                soft: 'We can provide a checklist and data handling notes.',
                direct: 'Let’s loop in compliance early to avoid surprises.',
            },
            proof: 'We’ve passed reviews with similar teams before.',
            nextStep: 'Should we set a compliance review call?',
            tags: ['legal', 'risk'],
        })),
        makeObjectionNode('Priority shift', makeBundle({
            primaryLine: 'Understood — priorities move fast.',
            diagnoseQuestion: 'What’s taking priority right now?',
            responses: {
                soft: 'We can pause and revisit when it clears.',
                direct: 'If we keep this lightweight, could it stay on the list?',
            },
            nextStep: 'Want a light check‑in next month?',
            tags: ['priority', 'timing'],
        })),
    ];

    const rootNode: TreeNode = {
        id: uuidv4(),
        title: 'Pilot collaboration',
        type: 'decision',
        talkingPoints: ['Open with curiosity about their goals.'],
        questions: ['What would make this pilot a clear win for you?'],
        children: objections,
    };

    const now = Date.now();
    return {
        id: uuidv4(),
        name: 'Stefan Pilot — FunZone',
        description: 'Pilot collaboration proposal for TikTok marketing.',
        rootNode,
        createdAt: now,
        updatedAt: now,
        structured: {
            goal: 'Initiate a pilot program with FunZone.',
            stakeholder: 'Stefan (CMO of FunZone)',
            context: 'Follow-up on previous discussions to secure partnership.',
            decisionFrame: 'If they say X → I say Y',
        },
    };
}
