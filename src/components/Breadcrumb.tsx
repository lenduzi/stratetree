'use client';

import { TreeNode } from '@/lib/types';
import Link from 'next/link';

interface BreadcrumbProps {
    path: TreeNode[];
    projectId: string;
    onNavigate?: (nodeId: string) => void;
}

export function Breadcrumb({ path, projectId, onNavigate }: BreadcrumbProps) {
    return (
        <nav className="breadcrumb">
            <Link href={`/project/${projectId}`} className="breadcrumb-item">
                Edit
            </Link>
            <span className="breadcrumb-separator">›</span>
            {path.map((node, index) => {
                const isLast = index === path.length - 1;
                return (
                    <span key={node.id} className="breadcrumb-item">
                        {index > 0 && <span className="breadcrumb-separator">›</span>}
                        {isLast ? (
                            <span className="active">{node.title}</span>
                        ) : (
                            <button
                                onClick={() => onNavigate?.(node.id)}
                                className="breadcrumb-link"
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'inherit',
                                    cursor: 'pointer',
                                    padding: 0,
                                    font: 'inherit'
                                }}
                            >
                                {node.title}
                            </button>
                        )}
                    </span>
                );
            })}
        </nav>
    );
}
