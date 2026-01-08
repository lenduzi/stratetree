import { ObjectionBundle, ObjectionQuality, TreeNode } from './types';

const BUZZWORDS = [
    'synergy',
    'leverage',
    'optimize',
    'revolutionary',
    'cutting-edge',
    'paradigm',
    'disruptive',
];

const MAX_SPOKEN_LENGTH = 220;

function sentenceCount(text: string): number {
    return text
        .split(/[.!?]+/)
        .map((chunk) => chunk.trim())
        .filter(Boolean).length;
}

function hasBuzzword(text: string): boolean {
    const lower = text.toLowerCase();
    return BUZZWORDS.some((word) => lower.includes(word));
}

function warnIfLong(text: string, label: string, warnings: string[]) {
    if (text.length > MAX_SPOKEN_LENGTH) {
        warnings.push(`${label} is long for call mode.`);
    }
}

export function validateObjectionBundle(bundle?: ObjectionBundle | null): ObjectionQuality {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!bundle) {
        return { score: 0, errors: ['Missing objection bundle.'], warnings: [] };
    }

    const requiredFields: Array<[string, string, number]> = [
        ['Primary line', bundle.primaryLine || '', 2],
        ['Diagnose question', bundle.diagnoseQuestion || '', 1],
        ['Soft response', bundle.responses?.soft || '', 2],
        ['Direct response', bundle.responses?.direct || '', 2],
        ['Next step', bundle.nextStep || '', 1],
    ];

    for (const [label, value, maxSentences] of requiredFields) {
        if (!value.trim()) {
            errors.push(`${label} is required.`);
            continue;
        }
        if (sentenceCount(value) > maxSentences) {
            errors.push(`${label} must be ${maxSentences} sentence${maxSentences > 1 ? 's' : ''} or fewer.`);
        }
        warnIfLong(value, label, warnings);
        if (hasBuzzword(value)) {
            warnings.push(`${label} uses buzzwordy language.`);
        }
    }

    const optionalFields: Array<[string, string | undefined, number]> = [
        ['Challenger response', bundle.responses?.challenger, 2],
        ['Proof', bundle.proof, 1],
        ['Risk reset', bundle.riskReset, 1],
    ];

    for (const [label, value, maxSentences] of optionalFields) {
        if (!value) continue;
        if (sentenceCount(value) > maxSentences) {
            errors.push(`${label} must be ${maxSentences} sentence${maxSentences > 1 ? 's' : ''} or fewer.`);
        }
        warnIfLong(value, label, warnings);
        if (hasBuzzword(value)) {
            warnings.push(`${label} uses buzzwordy language.`);
        }
    }

    const score = Math.max(0, 100 - errors.length * 25 - warnings.length * 5);
    return { score, errors, warnings };
}

export function collectObjectionNodes(root: TreeNode): TreeNode[] {
    const results: TreeNode[] = [];
    const walk = (node: TreeNode) => {
        if (node.type === 'objection' || node.objectionBundle) {
            results.push(node);
        }
        node.children.forEach(walk);
    };
    walk(root);
    return results;
}

export function summarizeObjectionQuality(root: TreeNode) {
    const nodes = collectObjectionNodes(root);
    if (nodes.length === 0) {
        return {
            total: 0,
            blocking: 0,
            warnings: 0,
            averageScore: 0,
        };
    }
    let blocking = 0;
    let warnings = 0;
    let totalScore = 0;
    nodes.forEach((node) => {
        const result = validateObjectionBundle(node.objectionBundle);
        if (result.errors.length > 0) blocking += 1;
        warnings += result.warnings.length;
        totalScore += result.score;
    });
    return {
        total: nodes.length,
        blocking,
        warnings,
        averageScore: Math.round(totalScore / nodes.length),
    };
}
