// Core types for Stratetree

export type NodeSentiment = 'positive' | 'neutral' | 'negative';
export type NodeType = 'decision' | 'objection' | 'info';

export type ObjectionPattern =
    | 'clarify'
    | 'reframe'
    | 'reduce_risk'
    | 'proof_mechanism'
    | 'cost_of_inaction'
    | 'trade'
    | 'two_way_close';

export interface ObjectionBundleBase {
    primaryLine: string;
    diagnoseQuestion: string;
    responses: {
        soft: string;
        direct: string;
        challenger?: string;
    };
    proof?: string;
    riskReset?: string;
    nextStep: string;
    tags: string[];
    patternHints?: {
        primaryLine?: ObjectionPattern;
        soft?: ObjectionPattern;
        direct?: ObjectionPattern;
        challenger?: ObjectionPattern;
    };
    needsFill?: boolean;
}

export interface ObjectionQuality {
    score: number;
    errors: string[];
    warnings: string[];
}

export interface ObjectionBundle extends ObjectionBundleBase {
    emotionVariants?: {
        neutral?: Partial<ObjectionBundleBase>;
        annoyed?: Partial<ObjectionBundleBase>;
        skeptical?: Partial<ObjectionBundleBase>;
        cold?: Partial<ObjectionBundleBase>;
    };
}

export interface TreeNode {
    id: string;
    title: string;             // Short label (e.g., "Price Objection")
    talkingPoints: string[];   // What to say at this node
    questions: string[];       // Discovery questions to ask (1-3)
    sentiment?: NodeSentiment; // Color coding: positive (green), neutral (yellow), negative (red)
    type?: NodeType;
    objectionBundle?: ObjectionBundle;
    objectionQuality?: ObjectionQuality;
    children: TreeNode[];      // Child options/branches
}

export interface Project {
    id: string;
    client_id?: string;
    name: string;
    description: string;       // Context for AI generation
    rootNode: TreeNode;
    createdAt: number;
    updatedAt: number;
    callHistory?: CallSummary[]; // Past call summaries
    structured?: StructuredBuckets;
}

export interface StructuredBuckets {
    goal: string;
    stakeholder: string;
    context: string;
    decisionFrame: string;
    redFlags?: string;
    nonNegotiables?: string;
    tone?: string;
    title?: string;
    rawCapture?: string;
    router?: ScenarioRouterResult;
    objections?: string[];
    objectionsFallback?: boolean;
    objectionHandlers?: Record<string, TreeNode>;
    intake?: {
        conversationType?: string;
        counterpart?: string;
        goalType?: string;
        sensitiveArea?: string;
    };
    selectedArchetypes?: string[];
}

export type ScenarioType =
    | 'salary_negotiation'
    | 'neighbor_conflict'
    | 'sales_call'
    | 'partnership'
    | 'interview'
    | 'performance_feedback'
    | 'personal_boundary'
    | 'other';

export type ScenarioCategory =
    | 'sales_partnership'
    | 'salary_negotiation'
    | 'customer_escalation'
    | 'personal_boundary'
    | 'relationship_conversation'
    | 'general_tough_conversation';

export interface ScenarioRouterResult {
    scenario_type: ScenarioType;
    scenario_category?: ScenarioCategory;
    goal: string;
    stakeholder: string;
    tone: string;
    constraints: string[];
    success_criteria: string[];
    taboo: string[];
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
