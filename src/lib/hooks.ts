'use client';

import { useState, useEffect, useCallback } from 'react';
import { Project, TreeNode } from './types';
import { getAllProjects, getProject, saveProject, deleteProject } from './db';

// Hook for managing projects list
export function useProjects() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getAllProjects();
            setProjects(data);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load projects');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { projects, loading, error, refresh };
}

// Hook for a single project
export function useProject(id: string | null) {
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!id) {
            setProject(null);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const data = await getProject(id);
            setProject(data || null);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load project');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const save = useCallback(async (updatedProject: Project) => {
        await saveProject(updatedProject);
        setProject(updatedProject);
    }, []);

    const remove = useCallback(async () => {
        if (id) {
            await deleteProject(id);
            setProject(null);
        }
    }, [id]);

    return { project, loading, error, refresh, save, remove };
}

// Helper: Find a node by ID in tree
export function findNodeById(root: TreeNode, id: string): TreeNode | null {
    if (root.id === id) return root;
    for (const child of root.children) {
        const found = findNodeById(child, id);
        if (found) return found;
    }
    return null;
}

// Helper: Get path from root to a node
export function getPathToNode(root: TreeNode, targetId: string, path: TreeNode[] = []): TreeNode[] | null {
    const currentPath = [...path, root];
    if (root.id === targetId) return currentPath;

    for (const child of root.children) {
        const result = getPathToNode(child, targetId, currentPath);
        if (result) return result;
    }
    return null;
}

// Helper: Update a node in tree (immutable)
export function updateNodeInTree(root: TreeNode, nodeId: string, updater: (node: TreeNode) => TreeNode): TreeNode {
    if (root.id === nodeId) {
        return updater(root);
    }
    return {
        ...root,
        children: (Array.isArray(root.children) ? root.children : []).map(child => updateNodeInTree(child, nodeId, updater)),
    };
}

// Helper: Add child to a node (immutable)
export function addChildToNode(root: TreeNode, parentId: string, newChild: TreeNode): TreeNode {
    return updateNodeInTree(root, parentId, (node) => ({
        ...node,
        children: [...node.children, newChild],
    }));
}

// Helper: Delete a node from tree (immutable)
export function deleteNodeFromTree(root: TreeNode, nodeId: string): TreeNode {
    return {
        ...root,
        children: root.children
            .filter(child => child.id !== nodeId)
            .map(child => deleteNodeFromTree(child, nodeId)),
    };
}
