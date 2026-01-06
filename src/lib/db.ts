import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Project } from './types';
import { saveCloudProject, deleteCloudProject } from './project-actions';

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
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<StratetreeDB>> | null = null;

function getDB(): Promise<IDBPDatabase<StratetreeDB>> {
    if (!dbPromise) {
        dbPromise = openDB<StratetreeDB>(DB_NAME, DB_VERSION, {
            upgrade(db) {
                // Projects store
                const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
                projectStore.createIndex('by-updated', 'updatedAt');

                // Settings store (for API key, etc.)
                db.createObjectStore('settings', { keyPath: undefined });
            },
        });
    }
    return dbPromise;
}

// Project CRUD operations
export async function getAllProjects(): Promise<Project[]> {
    const db = await getDB();
    const projects = await db.getAllFromIndex('projects', 'by-updated');
    return projects.reverse(); // Most recently updated first
}

export async function getProject(id: string): Promise<Project | undefined> {
    const db = await getDB();
    return db.get('projects', id);
}

export async function saveProject(project: Project, syncToCloud = true): Promise<void> {
    const db = await getDB();
    project.updatedAt = Date.now();
    await db.put('projects', project);

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
        await db.put('projects', project);
        imported++;
    }

    return imported;
}
