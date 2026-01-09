'use client';

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Play, Save, Plus, Trash2, Sparkles, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Project, TreeNode } from "@/lib/types";
import { getProject, saveProject } from "@/lib/db";
import { findNodeById, updateNodeInTree, addChildToNode, deleteNodeFromTree, getPathToNode } from "@/lib/hooks";
import { expandNodeAction, isServerApiKeyConfigured } from "@/lib/actions";
import { getBrowserApiKey } from "@/lib/settings";
import { getClientId } from "@/lib/client-id";
import { v4 as uuidv4 } from "uuid";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    loadProject();
  }, [id]);

  const loadProject = async () => {
    try {
      const data = await getProject(id);
      if (data) {
        setProject(data);
        setSelectedNodeId(data.rootNode.id);
      } else {
        setError("Project not found");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load project");
    } finally {
      const configured = await isServerApiKeyConfigured();
      setHasApiKey(!!getBrowserApiKey() || configured);
    }
  };

  const selectedNode = project && selectedNodeId ? findNodeById(project.rootNode, selectedNodeId) : null;
  const breadcrumbPath = project && selectedNodeId ? getPathToNode(project.rootNode, selectedNodeId) || [] : [];

  const handleSave = async () => {
    if (!project) return;
    await saveProject(project);
  };

  const handleUpdateNode = (updates: Partial<TreeNode>) => {
    if (!project || !selectedNodeId) return;
    const newRoot = updateNodeInTree(project.rootNode, selectedNodeId, (node) => ({
      ...node,
      ...updates,
    }));
    setProject({ ...project, rootNode: newRoot });
  };

  const createEmptyNode = (parentId: string): TreeNode => ({
    id: uuidv4(),
    title: "New branch",
    talkingPoints: ["Add your talking points here"],
    questions: [],
    children: [],
  });

  const handleAddChild = () => {
    if (!project || !selectedNodeId) return;
    const newNode = createEmptyNode(selectedNodeId);
    const newRoot = addChildToNode(project.rootNode, selectedNodeId, newNode);
    setProject({ ...project, rootNode: newRoot });
    setSelectedNodeId(newNode.id);
  };

  const handleDeleteNode = (nodeId: string) => {
    if (!project) return;
    if (nodeId === project.rootNode.id) {
      setError("Cannot delete the root node");
      return;
    }
    const newRoot = deleteNodeFromTree(project.rootNode, nodeId);
    setProject({ ...project, rootNode: newRoot });
    setSelectedNodeId(project.rootNode.id);
  };

  const handleExpandWithAI = async () => {
    if (!project || !selectedNode) return;
    setIsExpanding(true);
    setError(null);
    try {
      const newBranches = await expandNodeAction(
        project.description,
        selectedNode,
        getBrowserApiKey() || undefined,
        getClientId()
      );
      let newRoot = project.rootNode;
      for (const branch of newBranches) {
        newRoot = addChildToNode(newRoot, selectedNodeId!, branch);
      }
      setProject({ ...project, rootNode: newRoot });
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI expansion failed");
    } finally {
      setIsExpanding(false);
    }
  };

  const handleTalkingPointChange = (index: number, value: string) => {
    if (!selectedNode) return;
    const newPoints = [...selectedNode.talkingPoints];
    newPoints[index] = value;
    handleUpdateNode({ talkingPoints: newPoints });
  };

  const handleAddTalkingPoint = () => {
    if (!selectedNode) return;
    handleUpdateNode({ talkingPoints: [...selectedNode.talkingPoints, ""] });
  };

  const handleRemoveTalkingPoint = (index: number) => {
    if (!selectedNode) return;
    const newPoints = selectedNode.talkingPoints.filter((_, i) => i !== index);
    handleUpdateNode({ talkingPoints: newPoints });
  };

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        {error ? (
          <div className="text-muted-foreground">{error}</div>
        ) : (
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card shrink-0">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push("/app")}> 
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-display font-bold text-lg">{project.name}</h1>
              <p className="text-xs text-muted-foreground line-clamp-1">{project.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            <Button onClick={() => router.push(`/project/${project.id}/call`)} className="gradient-primary text-primary-foreground">
              <Play className="w-4 h-4 mr-2" />
              Start Call
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-72 border-r border-border bg-card overflow-y-auto shrink-0">
          <div className="p-4">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Decision Tree</h2>
            <TreeNodeItem
              node={project.rootNode}
              selectedId={selectedNodeId}
              onSelect={setSelectedNodeId}
              depth={0}
            />
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          {selectedNode ? (
            <div className="p-6 max-w-3xl">
              <div className="flex items-center gap-1 text-sm text-muted-foreground mb-6 flex-wrap">
                {breadcrumbPath.map((node, index) => (
                  <div key={node.id} className="flex items-center gap-1">
                    {index > 0 && <ChevronRight className="w-3 h-3" />}
                    <button
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`hover:text-foreground transition-colors ${
                        node.id === selectedNodeId ? "text-foreground font-medium" : ""
                      }`}
                    >
                      {node.title || "Untitled"}
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-2 mb-6">
                <label className="text-sm font-medium">Node Title</label>
                <Input
                  value={selectedNode.title}
                  onChange={(e) => handleUpdateNode({ title: e.target.value })}
                  placeholder="e.g., If they mention pricing concerns..."
                  className="text-lg font-medium"
                />
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Talking Points</label>
                  <Button variant="ghost" size="sm" onClick={handleAddTalkingPoint}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Point
                  </Button>
                </div>
                {selectedNode.talkingPoints.map((point, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={point}
                      onChange={(e) => handleTalkingPointChange(index, e.target.value)}
                      placeholder="Key phrase or point to make..."
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveTalkingPoint(index)}
                      className="shrink-0"
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Branches ({selectedNode.children.length})</label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExpandWithAI}
                      disabled={isExpanding || !hasApiKey}
                    >
                      {isExpanding ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-1" />
                      )}
                      AI Expand
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleAddChild}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add Branch
                    </Button>
                  </div>
                </div>

                {selectedNode.children.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-8 text-center text-muted-foreground">
                      <p className="text-sm">No branches yet. Add branches for different conversation paths.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-2">
                    {selectedNode.children.map((child) => (
                      <Card
                        key={child.id}
                        className="cursor-pointer hover:shadow-card transition-shadow"
                        onClick={() => setSelectedNodeId(child.id)}
                      >
                        <CardContent className="py-3 flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{child.title || "Untitled"}</p>
                            <p className="text-xs text-muted-foreground">
                              {child.talkingPoints.length} points · {child.children.length} branches
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteNode(child.id);
                              }}
                            >
                              <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {error && <div className="text-sm text-destructive">{error}</div>}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Select a node to edit
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const TreeNodeItem = ({
  node,
  selectedId,
  onSelect,
  depth,
}: {
  node: TreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth: number;
}) => {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const isSelected = node.id === selectedId;

  return (
    <div>
      <button
        onClick={() => onSelect(node.id)}
        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
          isSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
        }`}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="shrink-0"
          >
            <ChevronRight
              className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
          </button>
        )}
        {!hasChildren && <span className="w-4" />}
        <span className="truncate">{node.title || "Untitled"}</span>
        {hasChildren && (
          <Badge variant="secondary" className="ml-auto text-xs">
            {node.children.length}
          </Badge>
        )}
      </button>
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};
