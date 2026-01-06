// Core types for Stratetree

export type NodeSentiment = 'positive' | 'neutral' | 'negative';

export interface TreeNode {
    id: string;
    title: string;             // Short label (e.g., "Price Objection")
    talkingPoints: string[];   // What to say at this node
    questions: string[];       // Discovery questions to ask (1-3)
    sentiment?: NodeSentiment; // Color coding: positive (green), neutral (yellow), negative (red)
    children: TreeNode[];      // Child options/branches
}

export interface Project {
    id: string;
    name: string;
    description: string;       // Context for AI generation
    rootNode: TreeNode;
    createdAt: number;
    updatedAt: number;
    callHistory?: CallSummary[]; // Past call summaries
}

// For navigation state in live mode
export interface NavigationState {
    currentNodeId: string;
    path: string[];            // Array of node IDs from root to current
}

// Call summary after finishing a call
export interface CallSummary {
    id: string;
    timestamp: number;
    pathTaken: string[];       // Node IDs in order visited
    pathTitles: string[];      // Node titles for display
    aiSummary: string;         // AI-generated summary
    userNotes: string;         // User's own notes
    outcome?: 'success' | 'followup' | 'lost' | 'other';
}

// Theme preference
export type ThemeMode = 'dark' | 'light';
