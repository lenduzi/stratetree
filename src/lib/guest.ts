import { v4 as uuidv4 } from 'uuid';
import { Project, TreeNode } from './types';

const GUEST_PROJECTS_KEY = 'yapmap_guest_projects';
const GUEST_MIGRATED_KEY = 'yapmap_guest_migrated';
const GUEST_LIMIT_ACK_KEY = 'yapmap_guest_limit_ack';

type GuestProject = Project & { client_id: string };

function readGuestProjects(): GuestProject[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(GUEST_PROJECTS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        const projects = Array.isArray(parsed) ? parsed : [];
        let mutated = false;
        const normalized = projects.map((project: GuestProject) => {
            if (!project.client_id) {
                mutated = true;
                return { ...project, client_id: uuidv4() } as GuestProject;
            }
            return project;
        });
        if (mutated) {
            writeGuestProjects(normalized);
        }
        return normalized;
    } catch {
        return [];
    }
}

function writeGuestProjects(projects: GuestProject[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(GUEST_PROJECTS_KEY, JSON.stringify(projects));
}

export function getGuestProjects(): GuestProject[] {
    return readGuestProjects();
}

export function setGuestProjects(projects: GuestProject[]) {
    writeGuestProjects(projects);
}

export function upsertGuestProject(project: Project) {
    if (typeof window === 'undefined') return;
    if (!project.client_id) return;
    const projects = readGuestProjects();
    const next = projects.filter((p) => p.client_id !== project.client_id);
    next.unshift(project as GuestProject);
    writeGuestProjects(next.slice(0, 1));
}

export function guestLimitReached(): boolean {
    return readGuestProjects().length >= 1;
}

export function markGuestLimitAck() {
    if (typeof window === 'undefined') return;
    localStorage.setItem(GUEST_LIMIT_ACK_KEY, 'true');
}

export function getGuestLimitAck(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(GUEST_LIMIT_ACK_KEY) === 'true';
}

export async function migrateGuestProjectsToAccount(
    userId: string,
    upsert: (rows: Array<Record<string, any>>) => Promise<void>
): Promise<number> {
    const projects = readGuestProjects();
    if (projects.length === 0) return 0;
    const rows = projects.map((project) => ({
        id: project.id,
        user_id: userId,
        client_id: project.client_id,
        name: project.name,
        description: project.description,
        root_node: project.rootNode,
        call_history: project.callHistory || [],
        created_at: new Date(project.createdAt || Date.now()).toISOString(),
        updated_at: new Date(project.updatedAt || Date.now()).toISOString(),
    }));
    await upsert(rows);
    if (typeof window !== 'undefined') {
        localStorage.removeItem(GUEST_PROJECTS_KEY);
        localStorage.setItem(GUEST_MIGRATED_KEY, 'true');
    }
    return rows.length;
}

export function clearGuestMigrationFlag() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(GUEST_MIGRATED_KEY);
}

export function isGuestMigrated(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(GUEST_MIGRATED_KEY) === 'true';
}

export function ensureGuestProjectDefaults(project: Project): Project {
    return {
        ...project,
        callHistory: project.callHistory || [],
        rootNode: project.rootNode as TreeNode,
    };
}
