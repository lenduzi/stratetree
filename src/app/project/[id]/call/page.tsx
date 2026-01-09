'use client';

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, MessageSquare, X, Send, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Project } from "@/lib/types";
import { getProject } from "@/lib/db";
import { findNodeById, getPathToNode } from "@/lib/hooks";
import { quickChatAction } from "@/lib/actions";
import { getBrowserApiKey } from "@/lib/settings";
import { getClientId } from "@/lib/client-id";

export default function CallModePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [currentNodeId, setCurrentNodeId] = useState<string>("");
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  const [showQuickChat, setShowQuickChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatResponse, setChatResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const loadProject = async () => {
      const loaded = await getProject(id);
      if (loaded) {
        setProject(loaded);
        setCurrentNodeId(loaded.rootNode.id);
        setVisitedIds(new Set([loaded.rootNode.id]));
      } else {
        router.replace("/app");
      }
    };
    loadProject();
  }, [id, router]);

  const currentNode = project ? findNodeById(project.rootNode, currentNodeId) : null;
  const breadcrumbPath = project ? getPathToNode(project.rootNode, currentNodeId) || [] : [];

  const handleSelectBranch = (nodeId: string) => {
    setCurrentNodeId(nodeId);
    setVisitedIds((prev) => new Set([...prev, nodeId]));
    setChatResponse("");
  };

  const handleGoBack = () => {
    if (breadcrumbPath.length > 1) {
      const parentNode = breadcrumbPath[breadcrumbPath.length - 2];
      setCurrentNodeId(parentNode.id);
    }
  };

  const handleQuickChat = async () => {
    if (!chatInput.trim() || !project || !currentNode) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await quickChatAction(
        project.description,
        currentNode,
        chatInput,
        getBrowserApiKey() || undefined,
        getClientId()
      );
      setChatResponse(response);
      setChatInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Quick chat failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (!project || !currentNode) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const children = Array.isArray(currentNode.children) ? currentNode.children : [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card shrink-0">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push(`/project/${project.id}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Exit Call
            </Button>
            <div className="h-4 w-px bg-border" />
            <span className="text-sm font-medium">{project.name}</span>
          </div>
          <Button
            variant={showQuickChat ? "default" : "outline"}
            size="sm"
            onClick={() => setShowQuickChat(!showQuickChat)}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Quick AI
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/30 shrink-0">
            <div className="flex items-center gap-1 text-sm flex-wrap">
              {breadcrumbPath.map((node, index) => (
                <div key={node.id} className="flex items-center gap-1">
                  {index > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                  <button
                    onClick={() => handleSelectBranch(node.id)}
                    className={`px-2 py-1 rounded transition-colors ${
                      node.id === currentNodeId
                        ? "bg-primary text-primary-foreground font-medium"
                        : visitedIds.has(node.id)
                        ? "text-node-visited hover:bg-muted"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {node.title}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto">
              <Card className="mb-8 shadow-card animate-fade-in">
                <CardContent className="pt-6">
                  <h2 className="text-2xl font-display font-bold mb-4">{currentNode.title}</h2>
                  <ul className="space-y-3">
                    {(Array.isArray(currentNode.talkingPoints) ? currentNode.talkingPoints : []).map((point, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-3 text-lg animate-slide-in"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <CheckCircle2 className="w-5 h-5 text-accent mt-1 shrink-0" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {children.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Where is the conversation going?
                  </h3>
                  <div className="grid gap-3">
                    {children.map((child, index) => (
                      <button
                        key={child.id}
                        onClick={() => handleSelectBranch(child.id)}
                        className={`w-full text-left p-4 rounded-lg border transition-all hover:shadow-card animate-fade-in ${
                          visitedIds.has(child.id)
                            ? "border-node-visited/50 bg-node-visited/5"
                            : "border-border bg-card hover:border-primary/50"
                        }`}
                        style={{ animationDelay: `${index * 75}ms` }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{child.title}</span>
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        </div>
                        {child.talkingPoints.length > 0 && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {child.talkingPoints[0]}
                            {child.talkingPoints.length > 1 && ` (+${child.talkingPoints.length - 1} more)`}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {children.length === 0 && breadcrumbPath.length > 1 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">End of this branch</p>
                  <Button variant="outline" onClick={handleGoBack}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Go Back
                  </Button>
                </div>
              )}
            </div>
          </div>
        </main>

        {showQuickChat && (
          <aside className="w-80 border-l border-border bg-card flex flex-col shrink-0 animate-slide-in">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-medium">Quick AI Chat</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowQuickChat(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {chatResponse ? (
                <div className="bg-muted rounded-lg p-4 text-sm">
                  <p className="whitespace-pre-wrap">{chatResponse}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Ask anything that came up unexpectedly in the call. I'll give you a quick response.
                </p>
              )}
              {error && <p className="text-sm text-destructive mt-3">{error}</p>}
            </div>

            <div className="p-4 border-t border-border">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleQuickChat();
                }}
                className="flex gap-2"
              >
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="What should I say about...?"
                  disabled={isLoading}
                />
                <Button type="submit" size="icon" disabled={isLoading || !chatInput.trim()}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </form>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
