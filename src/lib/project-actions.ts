'use server';

import { createClient } from './supabase-server';
import { Project } from './types';
import { revalidatePath } from 'next/cache';

export async function getCloudProjects(): Promise<Project[]> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return [];

    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('Error fetching projects:', error);
        return [];
    }

    return (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        rootNode: p.root_node,
        callHistory: p.call_history,
        createdAt: new Date(p.created_at).getTime(),
        updatedAt: new Date(p.updated_at).getTime(),
    }));
}

export async function saveCloudProject(project: Project): Promise<void> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase
        .from('projects')
        .upsert({
            id: project.id,
            user_id: user.id,
            name: project.name,
            description: project.description,
            root_node: project.rootNode,
            call_history: project.callHistory || [],
            updated_at: new Date().toISOString(),
        });

    if (error) {
        console.error('Error saving project:', error);
        throw new Error(error.message);
    }

    revalidatePath('/');
    revalidatePath(`/project/${project.id}`);
}

export async function deleteCloudProject(id: string): Promise<void> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase
        .from('projects')
        .delete()
        .match({ id, user_id: user.id });

    if (error) {
        console.error('Error deleting project:', error);
        throw new Error(error.message);
    }

    revalidatePath('/');
}
