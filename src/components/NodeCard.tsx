'use client';

import { TreeNode, NodeSentiment } from '@/lib/types';

interface NodeCardProps {
    node: TreeNode;
    index?: number;
    isActive?: boolean;
    onClick?: () => void;
    compact?: boolean;
}

function getSentimentClass(sentiment?: NodeSentiment): string {
    switch (sentiment) {
        case 'positive': return 'sentiment-positive';
        case 'neutral': return 'sentiment-neutral';
        case 'negative': return 'sentiment-negative';
        default: return '';
    }
}

function getSentimentEmoji(sentiment?: NodeSentiment): string {
    switch (sentiment) {
        case 'positive': return '🟢';
        case 'neutral': return '🟡';
        case 'negative': return '🔴';
        default: return '';
    }
}

export function NodeCard({
    node,
    index,
    isActive,
    onClick,
    compact = false
}: NodeCardProps) {
    const sentimentClass = getSentimentClass(node.sentiment);

    return (
        <div
            className={`node-card ${isActive ? 'node-card-active' : ''} ${sentimentClass}`}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick?.();
                }
            }}
        >
            {typeof index === 'number' && (
                <span className="node-card-number">{index + 1}</span>
            )}
            <div className="node-title">
                {node.sentiment && <span style={{ marginRight: 6 }}>{getSentimentEmoji(node.sentiment)}</span>}
                {node.title}
            </div>
            {!compact && node.talkingPoints.length > 0 && (
                <div className="mt-md">
                    {node.talkingPoints.slice(0, 2).map((point, i) => (
                        <div key={i} className="node-talking-point">{point}</div>
                    ))}
                    {node.talkingPoints.length > 2 && (
                        <div className="node-talking-point text-muted">
                            +{node.talkingPoints.length - 2} more...
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export { getSentimentClass, getSentimentEmoji };
