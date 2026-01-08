import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { v4 as uuidv4 } from 'uuid';
import { ObjectionBundle, Project, TreeNode } from './types';
import { saveCloudProject, deleteCloudProject } from './project-actions';
import { getStefanPilotProject } from './seed';

interface StratetreeDB extends DBSchema {
    projects: {
        key: string;
        value: Project;
        indexes: { 'by-updated': number };
    };
    settings: {
        key: string;
        value: string;
    };
}

const DB_NAME = 'stratetree-db';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<StratetreeDB>> | null = null;

function createPlaceholderBundle(): ObjectionBundle {
    return {
        primaryLine: '',
        diagnoseQuestion: '',
        responses: { soft: '', direct: '' },
        nextStep: '',
        tags: [],
        needsFill: true,
    };
}

function normalizeNode(raw: any): TreeNode {
    const childrenRaw = Array.isArray(raw?.children)
        ? raw.children
        : raw?.children
            ? [raw.children]
            : [];
    const normalizedChildren = childrenRaw.map(normalizeNode);
    const title = typeof raw?.title === 'string' ? raw.title : 'Untitled';
    const isObjection =
        raw?.type === 'objection' ||
        raw?.sentiment === 'negative' ||
        /objection|pushback|resistance/i.test(title);
    const type = raw?.type || (isObjection ? 'objection' : 'decision');
    let objectionBundle = raw?.objectionBundle as ObjectionBundle | undefined;
    if (type === 'objection' && !objectionBundle) {
        objectionBundle = createPlaceholderBundle();
    }
    return {
        id: typeof raw?.id === 'string' ? raw.id : uuidv4(),
        title,
        talkingPoints: Array.isArray(raw?.talkingPoints) ? raw.talkingPoints : [],
        questions: Array.isArray(raw?.questions) ? raw.questions : [],
        sentiment: raw?.sentiment,
        type,
        objectionBundle,
        objectionQuality: raw?.objectionQuality,
        children: normalizedChildren,
    };
}

function normalizeProject(project: Project): Project {
    return {
        ...project,
        rootNode: normalizeNode(project.rootNode),
    };
}

function getDB(): Promise<IDBPDatabase<StratetreeDB>> {
    if (!dbPromise) {
        dbPromise = openDB<StratetreeDB>(DB_NAME, DB_VERSION, {
            async upgrade(db, oldVersion, _newVersion, transaction) {
                if (oldVersion < 1) {
                    const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
                    projectStore.createIndex('by-updated', 'updatedAt');
                    db.createObjectStore('settings', { keyPath: undefined });
                }

                if (oldVersion < 2) {
                    const store = transaction.objectStore('projects');
                    let cursor = await store.openCursor();
                    while (cursor) {
                        const normalized = normalizeProject(cursor.value);
                        await cursor.update(normalized);
                        cursor = await cursor.continue();
                    }
                }
            },
        });
    }
    return dbPromise;
}

// Project CRUD operations
export async function getAllProjects(): Promise<Project[]> {
    const db = await getDB();
    const projects = await db.getAllFromIndex('projects', 'by-updated');
    return projects.map(normalizeProject).reverse(); // Most recently updated first
}

export async function getProject(id: string): Promise<Project | undefined> {
    const db = await getDB();
    const project = await db.get('projects', id);
    return project ? normalizeProject(project) : undefined;
}

export async function saveProject(project: Project, syncToCloud = true): Promise<void> {
    const db = await getDB();
    project.updatedAt = Date.now();
    if (!project.client_id) {
        project.client_id = uuidv4();
    }
    await db.put('projects', normalizeProject(project));

    if (syncToCloud) {
        try {
            await saveCloudProject(project);
        } catch (e) {
            console.warn('Could not sync to cloud:', e);
            // Local save still succeeded
        }
    }
}

export async function deleteProject(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('projects', id);

    try {
        await deleteCloudProject(id);
    } catch (e) {
        console.warn('Could not delete from cloud:', e);
    }
}

// Settings operations
export async function getSetting(key: string): Promise<string | undefined> {
    const db = await getDB();
    return db.get('settings', key);
}

export async function setSetting(key: string, value: string): Promise<void> {
    const db = await getDB();
    await db.put('settings', value, key);
}

// Export/Import functionality
export async function exportAllData(): Promise<string> {
    const projects = await getAllProjects();
    return JSON.stringify({ projects, exportedAt: Date.now() }, null, 2);
}

export async function importData(jsonString: string): Promise<number> {
    const data = JSON.parse(jsonString);
    const db = await getDB();

    let imported = 0;
    for (const project of data.projects || []) {
        await db.put('projects', normalizeProject(project));
        imported++;
    }

    return imported;
}

export async function ensureSeedProject(): Promise<boolean> {
    const existing = await getAllProjects();
    if (existing.length > 0) return false;
    const seed = getStefanPilotProject();
    await saveProject(seed, false);
    return true;
}
