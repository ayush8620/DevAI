"use client";
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Key, Copy, Check, Trash2, FolderKanban, ShieldCheck, AlertTriangle } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  apiKeyCount: number;
  requestCount: number;
}

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  status: string;
  lastUsedAt?: string;
  createdAt: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);

  // Dialog states
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Form states
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [keyName, setKeyName] = useState('');

  const loadProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
      if (data.length > 0 && !selectedProject) {
        setSelectedProject(data[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const loadApiKeys = async (projId: string) => {
    setLoadingKeys(true);
    try {
      const data = await api.getApiKeys(projId);
      setApiKeys(data);
    } catch (err) {
      console.error(err);
      setApiKeys([]);
    } finally {
      setLoadingKeys(false);
    }
  };

  useEffect(() => {
    if (selectedProject) {
      loadApiKeys(selectedProject);
    }
  }, [selectedProject]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName) return;
    try {
      await api.createProject({
        name: projectName,
        description: projectDesc || undefined,
      });
      setShowCreateProject(false);
      setProjectName('');
      setProjectDesc('');
      await loadProjects();
    } catch (err: any) {
      alert('Failed to create project: ' + err.message);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !keyName) return;
    try {
      const res = await api.createApiKey(selectedProject, { name: keyName });
      setGeneratedKey(res.data.key);
      setShowCreateKey(false);
      setKeyName('');
      await loadApiKeys(selectedProject);
      await loadProjects();
    } catch (err: any) {
      alert('Failed to generate API key: ' + err.message);
    }
  };

  const handleDeleteApiKey = async (id: string) => {
    if (!confirm('Revoke this API key? Applications using it will lose access immediately.')) return;
    try {
      await api.deleteApiKey(id);
      if (selectedProject) await loadApiKeys(selectedProject);
      await loadProjects();
    } catch (err: any) {
      alert('Revocation failed: ' + err.message);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm('Delete this project? All associated API keys will be revoked.')) return;
    try {
      await api.deleteProject(id);
      if (selectedProject === id) setSelectedProject(null);
      await loadProjects();
    } catch (err: any) {
      alert('Failed to delete project: ' + err.message);
    }
  };

  const copyKeyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">Isolate usage, quotas, and access credentials per project.</p>
        </div>
        <button
          onClick={() => setShowCreateProject(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 inline-flex items-center gap-2 rounded-lg text-sm font-medium shadow"
        >
          <Plus className="h-4 w-4" /> Create Project
        </button>
      </div>

      {/* Generated Key Alert Modal */}
      {generatedKey && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 space-y-3">
          <div className="flex items-center gap-2 text-amber-500 font-semibold">
            <AlertTriangle className="h-5 w-5" />
            <span>Copy your new API Key</span>
          </div>
          <p className="text-xs text-muted-foreground">
            This API key will only be shown once. If lost, you must generate a new one.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={generatedKey}
              className="flex-1 bg-background border px-3 py-2 rounded-lg font-mono text-xs select-all"
            />
            <button
              onClick={() => copyKeyToClipboard(generatedKey)}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 shadow"
            >
              {copiedKey ? <Check className="h-3.5 w-3.5 text-green-300" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedKey ? 'Copied' : 'Copy Key'}
            </button>
            <button
              onClick={() => setGeneratedKey(null)}
              className="px-3 py-2 border rounded-lg text-xs font-medium hover:bg-muted"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Projects Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className="h-36 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 border rounded-xl bg-card text-muted-foreground">
          <FolderKanban className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No projects found</p>
          <p className="text-sm mt-1">Create a project (e.g., &quot;PathEd&quot;, &quot;SOCGPT&quot;, &quot;Internal Tools&quot;) to generate API keys.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map(p => (
            <div
              key={p.id}
              onClick={() => setSelectedProject(p.id)}
              className={`p-6 border rounded-xl bg-card shadow-sm cursor-pointer transition-all hover:border-primary/50 ${selectedProject === p.id ? 'ring-2 ring-primary border-primary' : ''}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">{p.name}</h3>
                <span className={`w-2.5 h-2.5 rounded-full ${p.status === 'active' ? 'bg-green-500' : 'bg-zinc-400'}`} />
              </div>
              <p className="text-xs text-muted-foreground mt-1 min-h-[2rem] line-clamp-2">
                {p.description || 'No description provided'}
              </p>
              <div className="flex justify-between items-center text-xs text-muted-foreground mt-4 pt-3 border-t">
                <span>{p.apiKeyCount || 0} API Key(s)</span>
                <span>{p.requestCount.toLocaleString()} Requests</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected Project API Keys */}
      {selectedProject && (
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Key className="h-5 w-5 text-primary" />
                API Keys for {projects.find(p => p.id === selectedProject)?.name}
              </h2>
              <p className="text-sm text-muted-foreground">Authenticate your client applications with these bearer tokens.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCreateKey(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3 py-1.5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium"
              >
                <Plus className="h-3.5 w-3.5" /> Generate Key
              </button>
              <button
                onClick={() => handleDeleteProject(selectedProject)}
                className="text-destructive hover:bg-destructive/10 h-9 px-3 py-1.5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Project
              </button>
            </div>
          </div>

          {loadingKeys ? (
            <div className="h-32 bg-muted animate-pulse rounded-lg" />
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No API keys generated yet for this project.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="py-2 text-left">Key Name</th>
                    <th className="py-2 text-left">Prefix</th>
                    <th className="py-2 text-left">Status</th>
                    <th className="py-2 text-left">Created</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map(k => (
                    <tr key={k.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 font-medium">{k.name}</td>
                      <td className="py-3 font-mono text-xs">{k.keyPrefix}••••••••</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${k.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                          {k.status}
                        </span>
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">
                        {new Date(k.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleDeleteApiKey(k.id)}
                          className="text-muted-foreground hover:text-destructive p-1 rounded"
                          title="Revoke Key"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateProject && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h2 className="text-xl font-bold">Create New Project</h2>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Project Name</label>
                <input
                  type="text"
                  placeholder="e.g. PathEd, SOCGPT, Production App"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
                <textarea
                  placeholder="Brief description of the app or environment"
                  value={projectDesc}
                  onChange={e => setProjectDesc(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateProject(false)}
                  className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generate API Key Modal */}
      {showCreateKey && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h2 className="text-xl font-bold">Generate API Key</h2>
            <form onSubmit={handleCreateApiKey} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Key Label</label>
                <input
                  type="text"
                  placeholder="e.g. Backend Server, Staging Worker"
                  value={keyName}
                  onChange={e => setKeyName(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                A secret token with prefix <code className="font-mono text-primary">dvai_</code> will be generated.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateKey(false)}
                  className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
                >
                  Generate Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}