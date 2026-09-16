const fs = require('fs');
const path = require('path');

const files = {
  'src/app/providers/page.tsx': `"use client";
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function ProvidersPage() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProviders()
      .then(setProviders)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Providers</h1>
        <button className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 inline-flex items-center justify-center rounded-md text-sm font-medium">
          Add Provider
        </button>
      </div>
      
      {loading ? (
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      ) : providers.length === 0 ? (
        <div className="text-center py-12 border rounded-xl bg-card text-muted-foreground">
          No providers found. Add one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {providers.map((p: any) => (
            <div key={p.id} className="p-6 border rounded-xl bg-card shadow-sm flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  {p.name}
                  <span className={\`w-2 h-2 rounded-full \${p.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'}\`} />
                </h3>
                <p className="text-sm text-muted-foreground uppercase">{p.type}</p>
              </div>
              <div className="flex gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{p.modelCount || 0}</div>
                  <div className="text-xs text-muted-foreground">Models</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{p.credentialCount || 0}</div>
                  <div className="text-xs text-muted-foreground">Keys</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}`,
  'src/app/projects/page.tsx': `"use client";
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProjects()
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
        <button className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 inline-flex items-center justify-center rounded-md text-sm font-medium">
          Create Project
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 border rounded-xl bg-card text-muted-foreground">
          No projects found. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p: any) => (
            <div key={p.id} className="p-6 border rounded-xl bg-card shadow-sm space-y-4">
              <h3 className="text-xl font-semibold">{p.name}</h3>
              <p className="text-sm text-muted-foreground">{p.description || 'No description'}</p>
              <div className="flex justify-between items-center text-sm">
                <span>Keys: {p.apiKeyCount || 0}</span>
                <span>Requests: {p.requestCount || 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}`,
  'src/app/usage/page.tsx': `"use client";
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function UsagePage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock loading
    setTimeout(() => setLoading(false), 500);
  }, []);

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Usage Analytics</h1>
      <div className="border rounded-xl p-8 bg-card text-center text-muted-foreground">
        Detailed usage charts and breakdowns will appear here.
      </div>
    </div>
  );
}`,
  'src/app/settings/page.tsx': `"use client";
import { useEffect, useState } from 'react';
import { api, API_URL } from '@/lib/api';

export default function SettingsPage() {
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    api.getHealth().then(setHealth).catch(console.error);
  }, []);

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      
      <div className="grid gap-8 max-w-2xl">
        <div className="border rounded-xl p-6 bg-card space-y-4">
          <h3 className="text-lg font-semibold">Gateway Configuration</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="text-muted-foreground">API URL</div>
            <div className="font-mono">{API_URL}</div>
          </div>
        </div>

        <div className="border rounded-xl p-6 bg-card space-y-4">
          <h3 className="text-lg font-semibold">System Health</h3>
          {health ? (
            <div className="space-y-4 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span>Status</span>
                <span className="text-green-500 font-medium">{health.status}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span>Uptime</span>
                <span>{Math.floor(health.uptime || 0)}s</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span>Redis</span>
                <span>{health.redis || 'N/A'}</span>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">Loading health status...</div>
          )}
        </div>
      </div>
    </div>
  );
}`,
  'src/app/api-docs/page.tsx': `export default function ApiDocsPage() {
  return (
    <div className="p-8 space-y-8 max-w-4xl">
      <h1 className="text-3xl font-bold tracking-tight">API Documentation</h1>
      
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <h2>Authentication</h2>
        <p>All API requests must include an API key in the Authorization header.</p>
        <pre><code>Authorization: Bearer dvai_your_api_key_here</code></pre>
        
        <h2>Endpoints</h2>
        
        <h3>Chat Completions</h3>
        <p><code>POST /v1/chat/completions</code></p>
        <p>Creates a model response for the given chat conversation.</p>
        
        <h4>Request</h4>
        <pre><code>{
  "model": "gpt-4",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ]
}</code></pre>
      </div>
    </div>
  );
}`
};

Object.entries(files).forEach(([filepath, content]) => {
  const fullPath = path.join(__dirname, filepath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  console.log('Created:', filepath);
});
