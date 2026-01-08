import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateObjectionBundle } from './objection-validator.ts';
import type { ObjectionBundle } from './types.ts';

function makeBundle(overrides: Partial<ObjectionBundle> = {}): ObjectionBundle {
    return {
        primaryLine: 'Totally fair — budget is real.',
        diagnoseQuestion: 'What range feels reasonable?',
        responses: {
            soft: 'We can start smaller and prove value first.',
            direct: 'If we align on ROI, can we find a number that works?',
        },
        nextStep: 'Open to a short pilot?',
        tags: ['budget'],
        ...overrides,
    };
}

test('flags missing required fields', () => {
    const bundle = makeBundle({ primaryLine: '' });
    const result = validateObjectionBundle(bundle);
    assert.ok(result.errors.length > 0);
    assert.ok(result.score < 100);
});

test('flags too many sentences', () => {
    const bundle = makeBundle({
        diagnoseQuestion: 'First question. Second question?',
    });
    const result = validateObjectionBundle(bundle);
    assert.ok(result.errors.some((err) => err.includes('Diagnose question')));
});

test('warns on buzzwords', () => {
    const bundle = makeBundle({
        primaryLine: 'This is a revolutionary, cutting-edge approach.',
    });
    const result = validateObjectionBundle(bundle);
    assert.ok(result.warnings.length > 0);
});
