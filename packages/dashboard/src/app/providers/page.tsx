"use client";
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Check, RefreshCw, Trash2, Key, Shield, AlertCircle, Play, Cpu, Layers } from 'lucide-react';

interface Provider {
  id: string;
  type: string;
  name: string;
  baseUrl?: string;
  status: string;
  credentialCount: number;
  modelCount: number;
}

interface Credential {
  id: string;
  name: string;
  maskedKey: string;
  enabled: boolean;
  status: string;
  quotaLimit?: number;
  quotaUsed: number;
  lastError?: string;
}

interface ModelItem {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  enabled: boolean;
  createdAt: string;
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'credentials' | 'models'>('credentials');

  // Credentials states
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loadingCreds, setLoadingCreds] = useState(false);

  // Models states
  const [modelsList, setModelsList] = useState<ModelItem[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [syncingModels, setSyncingModels] = useState(false);

  // Dialog states
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [showAddCred, setShowAddCred] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [testResult, setTestResult] = useState<{ [id: string]: string }>({});

  // Form states
  const [newType, setNewType] = useState('openai');
  const [newName, setNewName] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('');
  const [credName, setCredName] = useState('');
  const [credKey, setCredKey] = useState('');

  // Model Form states
  const [modelIdInput, setModelIdInput] = useState('');
  const [modelNameInput, setModelNameInput] = useState('');

  const loadProviders = async () => {
    try {
      const data = await api.getProviders();
      setProviders(data);
      if (data.length > 0 && !selectedProvider) {
        setSelectedProvider(data[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const loadCredentials = async (providerId: string) => {
    setLoadingCreds(true);
    try {
      const data = await api.getCredentials(providerId);
      setCredentials(data);
    } catch (err) {
      console.error(err);
      setCredentials([]);
    } finally {
      setLoadingCreds(false);
    }
  };

  const loadModels = async (providerId: string) => {
    setLoadingModels(true);
    try {
      const data = await api.getProviderModels(providerId);
      setModelsList(data);
    } catch (err) {
      console.error(err);
      setModelsList([]);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    if (selectedProvider) {
      loadCredentials(selectedProvider);
      loadModels(selectedProvider);
    }
  }, [selectedProvider]);

  const handleCreateProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;
    try {
      await api.createProvider({
        type: newType,
        name: newName,
        baseUrl: newBaseUrl || undefined,
      });
      setShowAddProvider(false);
      setNewName('');
      setNewBaseUrl('');
      await loadProviders();
    } catch (err: any) {
      alert('Failed to create provider: ' + err.message);
    }
  };

  const handleCreateCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider || !credName || !credKey) return;
    try {
      await api.createCredential(selectedProvider, {
        name: credName,
        apiKey: credKey,
      });
      setShowAddCred(false);
      setCredName('');
      setCredKey('');
      await loadCredentials(selectedProvider);
      await loadProviders();
    } catch (err: any) {
      alert('Failed to add credential: ' + err.message);
    }
  };

  const handleAddModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider || !modelIdInput) return;
    try {
      await api.addProviderModel(selectedProvider, {
        modelId: modelIdInput.trim(),
        displayName: modelNameInput.trim() || undefined,
      });
      setShowAddModel(false);
      setModelIdInput('');
      setModelNameInput('');
      await loadModels(selectedProvider);
      await loadProviders();
    } catch (err: any) {
      alert('Failed to add model: ' + err.message);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    if (!selectedProvider) return;
    if (!confirm(`Remove model "${modelId}" from this provider?`)) return;
    try {
      await api.deleteProviderModel(selectedProvider, modelId);
      await loadModels(selectedProvider);
      await loadProviders();
    } catch (err: any) {
      alert('Failed to delete model: ' + err.message);
    }
  };

  const handleSyncModels = async () => {
    if (!selectedProvider) return;
    setSyncingModels(true);
    try {
      const res = await api.syncProviderModels(selectedProvider);
      const data = res?.data || res;
      alert(`Successfully synced! Added ${data?.syncedCount || 0} new model(s). Total: ${data?.totalModels || 0}.`);
      await loadModels(selectedProvider);
      await loadProviders();
    } catch (err: any) {
      alert('Sync failed: ' + err.message);
    } finally {
      setSyncingModels(false);
    }
  };

  const handleTestProvider = async (id: string) => {
    setTestResult(prev => ({ ...prev, [id]: 'Testing...' }));
    try {
      const res = await api.testProvider(id);
      const data = res?.data || res;
      const isHealthy = data?.healthy === true || data?.status === 'healthy';
      if (isHealthy) {
        setTestResult(prev => ({ ...prev, [id]: `Healthy (${data.latencyMs || 0}ms)` }));
      } else {
        setTestResult(prev => ({ ...prev, [id]: data?.error || data?.status || 'Unavailable' }));
      }
    } catch (err: any) {
      setTestResult(prev => ({ ...prev, [id]: 'Failed: ' + err.message }));
    }
  };

  const handleTestCredential = async (id: string) => {
    setTestResult(prev => ({ ...prev, [id]: 'Testing...' }));
    try {
      const res = await api.testCredential(id);
      const data = res?.data || res;
      const isHealthy = data?.healthy === true || data?.status === 'active';
      if (isHealthy) {
        setTestResult(prev => ({ ...prev, [id]: `Active (${data.latencyMs || 0}ms)` }));
      } else {
        setTestResult(prev => ({ ...prev, [id]: data?.error || 'Failed' }));
      }
    } catch (err: any) {
      setTestResult(prev => ({ ...prev, [id]: 'Failed: ' + err.message }));
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!confirm('Are you sure you want to delete this provider?')) return;
    try {
      await api.deleteProvider(id);
      if (selectedProvider === id) setSelectedProvider(null);
      await loadProviders();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleDeleteCredential = async (id: string) => {
    if (!confirm('Delete this credential?')) return;
    try {
      await api.deleteCredential(id);
      if (selectedProvider) await loadCredentials(selectedProvider);
      await loadProviders();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  const currentProvider = providers.find(p => p.id === selectedProvider);

  return (
    <div className="p-8 space-y-8 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Providers</h1>
          <p className="text-muted-foreground mt-1">Manage cloud AI providers, credentials, and supported models.</p>
        </div>
        <button
          onClick={() => setShowAddProvider(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 inline-flex items-center gap-2 rounded-lg text-sm font-medium shadow"
        >
          <Plus className="h-4 w-4" /> Add Provider
        </button>
      </div>

      {/* Provider List */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : providers.length === 0 ? (
        <div className="text-center py-16 border rounded-xl bg-card text-muted-foreground">
          <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No providers configured yet</p>
          <p className="text-sm mt-1">Click &quot;Add Provider&quot; above to connect OpenAI, Anthropic, Google Gemini, Groq, or Ollama Cloud.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {providers.map(p => (
            <div
              key={p.id}
              onClick={() => setSelectedProvider(p.id)}
              className={`p-5 rounded-xl border bg-card shadow-sm cursor-pointer transition-all hover:border-primary/50 ${selectedProvider === p.id ? 'ring-2 ring-primary border-primary' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
                  {p.type}
                </span>
                <span className={`w-2.5 h-2.5 rounded-full ${p.status === 'active' ? 'bg-green-500' : 'bg-zinc-400'}`} />
              </div>
              <h3 className="text-lg font-bold mt-2">{p.name}</h3>
              <div className="flex justify-between items-center text-xs text-muted-foreground mt-4 pt-3 border-t">
                <span>{p.credentialCount || 0} key(s) • {p.modelCount || 0} model(s)</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleTestProvider(p.id); }}
                  className="hover:text-primary font-medium flex items-center gap-1"
                >
                  <Play className="h-3 w-3" /> Test
                </button>
              </div>
              {testResult[p.id] && (
                <p className="text-xs text-primary font-mono mt-2 font-medium">{testResult[p.id]}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Selected Provider Section */}
      {selectedProvider && (
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 gap-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                {currentProvider?.name}
                <span className="text-xs font-normal uppercase font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  {currentProvider?.type}
                </span>
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Base URL: <code className="font-mono text-xs">{currentProvider?.baseUrl || 'Default Cloud Endpoint'}</code>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Tab Selector */}
              <div className="inline-flex rounded-lg border bg-muted/40 p-1">
                <button
                  onClick={() => setActiveTab('credentials')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${activeTab === 'credentials' ? 'bg-card text-foreground shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Key className="h-3.5 w-3.5" /> Credentials ({credentials.length})
                </button>
                <button
                  onClick={() => setActiveTab('models')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${activeTab === 'models' ? 'bg-card text-foreground shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Cpu className="h-3.5 w-3.5" /> Models ({modelsList.length})
                </button>
              </div>

              <button
                onClick={() => handleDeleteProvider(selectedProvider)}
                className="text-destructive hover:bg-destructive/10 h-9 px-3 py-1.5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>

          {/* TAB 1: CREDENTIALS */}
          {activeTab === 'credentials' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">API keys are stored with AES-256-GCM encryption and rotated on 429 rate limits.</p>
                <button
                  onClick={() => setShowAddCred(true)}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 py-1 inline-flex items-center gap-1.5 rounded-md text-xs font-medium shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Credential
                </button>
              </div>

              {loadingCreds ? (
                <div className="h-32 bg-muted animate-pulse rounded-lg" />
              ) : credentials.length === 0 ? (
                <div className="text-center py-10 border border-dashed rounded-lg text-sm text-muted-foreground">
                  No credentials configured for this provider. Add one to enable routing.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="py-2 text-left">Name</th>
                        <th className="py-2 text-left">Encrypted Key</th>
                        <th className="py-2 text-left">Status</th>
                        <th className="py-2 text-left">Quota Used</th>
                        <th className="py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {credentials.map(c => (
                        <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-3 font-medium">{c.name}</td>
                          <td className="py-3 font-mono text-xs">{c.maskedKey}</td>
                          <td className="py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${c.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                              {c.status}
                            </span>
                          </td>
                          <td className="py-3">{c.quotaUsed.toLocaleString()} tokens</td>
                          <td className="py-3 text-right space-x-2">
                            <button
                              onClick={() => handleTestCredential(c.id)}
                              className="text-muted-foreground hover:text-primary p-1 rounded inline-flex items-center gap-1 text-xs"
                              title="Test Credential"
                            >
                              <Play className="h-3.5 w-3.5" />
                              {testResult[c.id] && <span className="text-[11px] font-mono text-primary font-medium">{testResult[c.id]}</span>}
                            </button>
                            <button
                              onClick={() => handleDeleteCredential(c.id)}
                              className="text-muted-foreground hover:text-destructive p-1 rounded inline-flex items-center"
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

          {/* TAB 2: MODELS */}
          {activeTab === 'models' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Custom & cloud models registered for this provider. Requests targeting these models will route here.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleSyncModels}
                    disabled={syncingModels || credentials.length === 0}
                    className="border hover:bg-muted disabled:opacity-50 h-8 px-3 py-1 inline-flex items-center gap-1.5 rounded-md text-xs font-medium"
                    title={credentials.length === 0 ? "Add an active credential first" : "Sync models from cloud"}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncingModels ? 'animate-spin' : ''}`} />
                    {syncingModels ? 'Syncing...' : 'Sync from Cloud API'}
                  </button>
                  <button
                    onClick={() => setShowAddModel(true)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 py-1 inline-flex items-center gap-1.5 rounded-md text-xs font-medium shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Model
                  </button>
                </div>
              </div>

              {loadingModels ? (
                <div className="h-32 bg-muted animate-pulse rounded-lg" />
              ) : modelsList.length === 0 ? (
                <div className="text-center py-10 border border-dashed rounded-lg space-y-2">
                  <Cpu className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
                  <p className="text-sm font-medium">No custom models added yet for this provider.</p>
                  <p className="text-xs text-muted-foreground">
                    Click &quot;Add Model&quot; to register a model ID manually (e.g. <code className="font-mono text-primary">gpt-oss:120b</code>, <code className="font-mono text-primary">deepseek-v4.1-flash</code>), or click &quot;Sync from Cloud API&quot;.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="py-2 text-left">Model ID</th>
                        <th className="py-2 text-left">Display Name</th>
                        <th className="py-2 text-left">Status</th>
                        <th className="py-2 text-left">Added Date</th>
                        <th className="py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modelsList.map(m => (
                        <tr key={m.id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-3 font-mono font-medium text-xs text-primary">{m.modelId}</td>
                          <td className="py-3">{m.displayName || m.modelId}</td>
                          <td className="py-3">
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-green-500/10 text-green-500">
                              Enabled
                            </span>
                          </td>
                          <td className="py-3 text-xs text-muted-foreground">
                            {new Date(m.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => handleDeleteModel(m.modelId)}
                              className="text-muted-foreground hover:text-destructive p-1 rounded inline-flex items-center"
                              title="Delete Model"
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
        </div>
      )}

      {/* Add Provider Modal */}
      {showAddProvider && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h2 className="text-xl font-bold">Add AI Provider</h2>
            <form onSubmit={handleCreateProvider} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Provider Type</label>
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="google">Google Gemini</option>
                  <option value="groq">Groq</option>
                  <option value="ollama">Ollama Cloud API</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Provider Name</label>
                <input
                  type="text"
                  placeholder="e.g. Production OpenAI, Ollama Cloud"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Base URL (Optional)</label>
                <input
                  type="url"
                  placeholder="e.g. https://ollama.com or leave empty"
                  value={newBaseUrl}
                  onChange={e => setNewBaseUrl(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddProvider(false)}
                  className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
                >
                  Save Provider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Credential Modal */}
      {showAddCred && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h2 className="text-xl font-bold">Add Authorized Credential</h2>
            <form onSubmit={handleCreateCredential} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Credential Name</label>
                <input
                  type="text"
                  placeholder="e.g. Primary Team Key"
                  value={credName}
                  onChange={e => setCredName(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">API Key Secret</label>
                <input
                  type="password"
                  placeholder="sk-... or Ollama API key"
                  value={credKey}
                  onChange={e => setCredKey(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
                  required
                />
                <p className="text-[11px] text-muted-foreground mt-1">This key will be encrypted with AES-256-GCM and never returned decrypted.</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCred(false)}
                  className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
                >
                  Encrypt & Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Model Modal */}
      {showAddModel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h2 className="text-xl font-bold">Add Model to Provider</h2>
            <p className="text-xs text-muted-foreground">
              Register a model identifier for this provider. Requests referencing this model ID will route to this provider.
            </p>
            <form onSubmit={handleAddModel} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Model Identifier (Required)</label>
                <input
                  type="text"
                  placeholder="e.g. gpt-oss:120b, deepseek-v4.1-flash, llama-3.3-70b"
                  value={modelIdInput}
                  onChange={e => setModelIdInput(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Display Label (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. DeepSeek V4.1 Flash, GPT-OSS 120B"
                  value={modelNameInput}
                  onChange={e => setModelNameInput(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModel(false)}
                  className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
                >
                  Add Model
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}