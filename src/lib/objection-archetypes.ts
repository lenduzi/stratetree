import { v4 as uuidv4 } from 'uuid';
import { ObjectionBundle, ObjectionPattern, TreeNode } from './types';

export type Archetype = {
    key: string;
    label: string;
    tags: string[];
    pattern: ObjectionPattern;
    primaryLine: string;
    diagnoseQuestion: string;
    soft: string;
    direct: string;
    nextStep: string;
};

export const OBJECTION_ARCHETYPES: Archetype[] = [
    {
        key: 'budget',
        label: 'Budget',
        tags: ['budget', 'scope'],
        pattern: 'reduce_risk',
        primaryLine: 'Totally fair — budget is real.',
        diagnoseQuestion: 'What range feels reasonable right now?',
        soft: 'We can start smaller and prove value first.',
        direct: 'If we can show ROI, can we find a number that works?',
        nextStep: 'Open to a small pilot with a cap?',
    },
    {
        key: 'priority',
        label: 'Not a priority',
        tags: ['priority', 'timing'],
        pattern: 'cost_of_inaction',
        primaryLine: 'Understood — priorities move fast.',
        diagnoseQuestion: 'What’s taking priority right now?',
        soft: 'We can revisit when that clears.',
        direct: 'If we keep it lightweight, can it stay on the list?',
        nextStep: 'Want a check‑in next month?',
    },
    {
        key: 'timing',
        label: 'Timing',
        tags: ['timing', 'capacity'],
        pattern: 'trade',
        primaryLine: 'Timing matters — no rush on your end.',
        diagnoseQuestion: 'What timing would feel right?',
        soft: 'We can plan now and start when ready.',
        direct: 'If we pick a window, can we hold a slot?',
        nextStep: 'Can we set a tentative window?',
    },
    {
        key: 'approval',
        label: 'Need approval',
        tags: ['stakeholders', 'process'],
        pattern: 'clarify',
        primaryLine: 'Makes sense — approvals take time.',
        diagnoseQuestion: 'Who else needs to feel good about this?',
        soft: 'Happy to share a short one‑pager.',
        direct: 'Could we loop them in together?',
        nextStep: 'Can we schedule a stakeholder sync?',
    },
    {
        key: 'risk',
        label: 'Risk',
        tags: ['risk', 'trust'],
        pattern: 'reduce_risk',
        primaryLine: 'Let’s make this low‑risk.',
        diagnoseQuestion: 'What feels risky about it?',
        soft: 'We can add clear guardrails.',
        direct: 'Would a time‑boxed pilot reduce the risk?',
        nextStep: 'Want a low‑risk pilot plan?',
    },
    {
        key: 'trust',
        label: 'Trust / credibility',
        tags: ['trust', 'proof'],
        pattern: 'proof_mechanism',
        primaryLine: 'Fair — trust has to be earned.',
        diagnoseQuestion: 'What would build trust fastest?',
        soft: 'I can share a relevant example.',
        direct: 'If we show proof, would you move forward?',
        nextStep: 'Can I send 1–2 proof points?',
    },
    {
        key: 'scope',
        label: 'Scope / complexity',
        tags: ['scope', 'effort'],
        pattern: 'reduce_risk',
        primaryLine: 'Let’s keep this simple.',
        diagnoseQuestion: 'Which part feels too big?',
        soft: 'We can scope to the smallest win.',
        direct: 'If we simplify scope, can we proceed?',
        nextStep: 'Want a trimmed scope proposal?',
    },
    {
        key: 'value',
        label: 'Value unclear',
        tags: ['roi', 'value'],
        pattern: 'reframe',
        primaryLine: 'Let’s make the value clear.',
        diagnoseQuestion: 'Which outcome matters most?',
        soft: 'We can align on 1–2 metrics.',
        direct: 'If we hit those, is it a yes?',
        nextStep: 'Can we pick top metrics?',
    },
    {
        key: 'control',
        label: 'Control / ownership',
        tags: ['control', 'process'],
        pattern: 'trade',
        primaryLine: 'You should stay in control here.',
        diagnoseQuestion: 'Where do you need ownership?',
        soft: 'We can define clear checkpoints.',
        direct: 'If you own decisions, can we move?',
        nextStep: 'Want to define checkpoints?',
    },
    {
        key: 'politics',
        label: 'Internal politics',
        tags: ['politics', 'stakeholders'],
        pattern: 'clarify',
        primaryLine: 'Understood — internal dynamics matter.',
        diagnoseQuestion: 'What’s the political risk?',
        soft: 'We can position this to support the team.',
        direct: 'If we align on messaging, can we proceed?',
        nextStep: 'Can we align the internal story?',
    },
    {
        key: 'compliance',
        label: 'Legal / compliance',
        tags: ['legal', 'risk'],
        pattern: 'reduce_risk',
        primaryLine: 'Compliance is non‑negotiable.',
        diagnoseQuestion: 'What’s the key compliance concern?',
        soft: 'We can provide a checklist.',
        direct: 'Let’s loop compliance in early.',
        nextStep: 'Schedule a compliance review?',
    },
    {
        key: 'capacity',
        label: 'Capacity',
        tags: ['capacity', 'resources'],
        pattern: 'trade',
        primaryLine: 'Capacity is tight — I get it.',
        diagnoseQuestion: 'Where is the bottleneck?',
        soft: 'We can reduce the lift.',
        direct: 'If we cut the lift, can we move?',
        nextStep: 'Want a low‑lift plan?',
    },
    {
        key: 'timelines',
        label: 'Timeline too short',
        tags: ['timing', 'risk'],
        pattern: 'reduce_risk',
        primaryLine: 'That timeline is aggressive.',
        diagnoseQuestion: 'What deadline is driving it?',
        soft: 'We can phase the rollout.',
        direct: 'If we phase it, can we commit?',
        nextStep: 'Agree to a phased plan?',
    },
    {
        key: 'vendor-fatigue',
        label: 'Vendor fatigue',
        tags: ['trust', 'fatigue'],
        pattern: 'proof_mechanism',
        primaryLine: 'You’ve seen a lot of vendors — fair.',
        diagnoseQuestion: 'What would make this different?',
        soft: 'We can prove value quickly.',
        direct: 'If we prove value fast, would you try?',
        nextStep: 'Okay with a short proof?',
    },
    {
        key: 'quality',
        label: 'Quality concerns',
        tags: ['quality', 'risk'],
        pattern: 'proof_mechanism',
        primaryLine: 'Quality matters — we can protect it.',
        diagnoseQuestion: 'What quality bar is non‑negotiable?',
        soft: 'We can share our QA plan.',
        direct: 'If we meet that bar, can we proceed?',
        nextStep: 'Want to review the QA plan?',
    },
    {
        key: 'price',
        label: 'Price too high',
        tags: ['budget', 'value'],
        pattern: 'trade',
        primaryLine: 'Price is a real concern.',
        diagnoseQuestion: 'What price would feel fair?',
        soft: 'We can adjust scope to fit.',
        direct: 'If we align on value, can we find a fit?',
        nextStep: 'Open to a scoped option?',
    },
    {
        key: 'process',
        label: 'Process complexity',
        tags: ['process', 'effort'],
        pattern: 'reduce_risk',
        primaryLine: 'We can keep the process simple.',
        diagnoseQuestion: 'What feels complex about it?',
        soft: 'We can remove extra steps.',
        direct: 'If we simplify it, can we move?',
        nextStep: 'Want a simpler flow?',
    },
    {
        key: 'measurement',
        label: 'Measurement / attribution',
        tags: ['metrics', 'roi'],
        pattern: 'proof_mechanism',
        primaryLine: 'Let’s make measurement clear.',
        diagnoseQuestion: 'Which metrics matter most?',
        soft: 'We can align on a small KPI set.',
        direct: 'If we can track those, is it a yes?',
        nextStep: 'Pick the KPIs together?',
    },
    {
        key: 'relationship',
        label: 'Relationship risk',
        tags: ['trust', 'relationship'],
        pattern: 'clarify',
        primaryLine: 'I don’t want this to strain the relationship.',
        diagnoseQuestion: 'What would feel respectful here?',
        soft: 'We can keep it low‑stakes.',
        direct: 'If we align on tone, can we proceed?',
        nextStep: 'Agree on a shared tone?',
    },
    {
        key: 'band',
        label: 'Comp bands',
        tags: ['salary', 'equity'],
        pattern: 'reframe',
        primaryLine: 'Bands are real — let’s work within them.',
        diagnoseQuestion: 'What flexibility exists within the band?',
        soft: 'We can explore non‑cash levers.',
        direct: 'If we adjust scope, can we revisit pay?',
        nextStep: 'Want to map non‑cash levers?',
    },
];

const INTAKE_MAP: Record<string, string[]> = {
    deal: ['budget', 'priority', 'timing', 'approval', 'value', 'risk', 'trust', 'measurement'],
    feedback: ['relationship', 'trust', 'priority', 'timing', 'capacity', 'process'],
    price: ['budget', 'price', 'value', 'risk', 'measurement', 'timing'],
    conflict: ['relationship', 'trust', 'priority', 'process', 'control'],
    performance: ['priority', 'capacity', 'timing', 'quality', 'risk'],
};

export function suggestTopArchetypes(input: {
    capture?: string;
    intake?: {
        conversationType?: string;
        counterpart?: string;
        goalType?: string;
        sensitiveArea?: string;
    };
}): Archetype[] {
    const seed = new Set<string>();
    const intakeType = input.intake?.conversationType;
    if (intakeType && INTAKE_MAP[intakeType]) {
        INTAKE_MAP[intakeType].forEach((key) => seed.add(key));
    }
    const sensitive = input.intake?.sensitiveArea;
    if (sensitive) {
        const match = OBJECTION_ARCHETYPES.find((a) => a.label.toLowerCase().includes(sensitive.toLowerCase()) || a.tags.includes(sensitive.toLowerCase()));
        if (match) seed.add(match.key);
    }
    const capture = (input.capture || '').toLowerCase();
    OBJECTION_ARCHETYPES.forEach((arch) => {
        if (capture.includes(arch.label.toLowerCase()) || arch.tags.some((tag) => capture.includes(tag))) {
            seed.add(arch.key);
        }
    });
    const ordered = [
        ...Array.from(seed).map((key) => OBJECTION_ARCHETYPES.find((a) => a.key === key)).filter(Boolean),
        ...OBJECTION_ARCHETYPES,
    ] as Archetype[];
    const unique: Archetype[] = [];
    const seen = new Set<string>();
    ordered.forEach((arch) => {
        if (!seen.has(arch.key)) {
            seen.add(arch.key);
            unique.push(arch);
        }
    });
    return unique.slice(0, 8);
}

export function buildObjectionNode(arch: Archetype): TreeNode {
    const bundle: ObjectionBundle = {
        primaryLine: arch.primaryLine,
        diagnoseQuestion: arch.diagnoseQuestion,
        responses: {
            soft: arch.soft,
            direct: arch.direct,
        },
        nextStep: arch.nextStep,
        tags: arch.tags,
        patternHints: {
            primaryLine: arch.pattern,
            soft: arch.pattern,
            direct: arch.pattern,
        },
    };
    return {
        id: uuidv4(),
        title: arch.label,
        type: 'objection',
        sentiment: 'negative',
        talkingPoints: [arch.primaryLine],
        questions: [arch.diagnoseQuestion],
        objectionBundle: bundle,
        children: [],
    };
}

export function applyHardMode(bundle: ObjectionBundle): ObjectionBundle {
    return {
        ...bundle,
        emotionVariants: {
            neutral: {
                primaryLine: bundle.primaryLine,
                diagnoseQuestion: bundle.diagnoseQuestion,
                responses: { ...bundle.responses },
                nextStep: bundle.nextStep,
            },
            annoyed: {
                primaryLine: 'I hear you, and I want to keep this simple.',
                diagnoseQuestion: 'What specifically is frustrating?',
                responses: {
                    soft: 'We can simplify the scope and reduce effort.',
                    direct: 'If we remove the friction, can we move forward?',
                    challenger: 'If this stays painful, what does it cost you?',
                },
                nextStep: 'Can we agree on a simpler next step?',
            },
            skeptical: {
                primaryLine: 'Totally fair to be skeptical.',
                diagnoseQuestion: 'What would make you believe this?',
                responses: {
                    soft: 'We can show proof quickly.',
                    direct: 'If we prove it, can we proceed?',
                    challenger: 'Is there a result that would change your mind?',
                },
                nextStep: 'Want a quick proof plan?',
            },
            cold: {
                primaryLine: 'I’ll be brief.',
                diagnoseQuestion: 'What’s the one thing that matters most?',
                responses: {
                    soft: 'We can keep this lightweight.',
                    direct: 'If we keep it lightweight, can we continue?',
                    challenger: 'If this stays unresolved, what happens?',
                },
                nextStep: 'Can we lock a short next step?',
            },
        },
    };
}
