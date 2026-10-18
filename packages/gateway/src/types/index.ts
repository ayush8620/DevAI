import { z } from 'zod';
import { KEY_STRATEGIES } from '../engine/keys.js';

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ---- Routing ----
export const ROUTING_MODES = ['single', 'fastest', 'best'] as const;
export type RoutingMode = typeof ROUTING_MODES[number];

/** A route target: provider (id, name or type) plus optional model. Strings may be "provider" or "provider:model". */
export const TargetSpecSchema = z.union([
  z.string().min(1),
  z.object({ provider: z.string().min(1), model: z.string().min(1).optional() }),
]);
export type TargetSpec = z.infer<typeof TargetSpecSchema>;

export const RoutingConfigSchema = z.object({
  /** single = one provider with automatic failover (default); fastest/best = parallel fan-out */
  mode: z.enum(ROUTING_MODES).optional(),
  /** Providers that participate, in priority order */
  providers: z.array(TargetSpecSchema).max(10).optional(),
  /** Judge model for mode "best" */
  judge: TargetSpecSchema.optional(),
  /** Per-provider call timeout (ms) */
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
  /** How a provider's multiple API keys are used (overrides the provider setting) */
  keyStrategy: z.enum(KEY_STRATEGIES).optional(),
});
export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;

export const ChatRequestSchema = z.object({
  model: z.string().default('auto'),
  messages: z.array(ChatMessageSchema),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  top_p: z.number().optional(),
  stream: z.boolean().optional(),
  stream_options: z.object({ include_usage: z.boolean().optional() }).optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  user: z.string().optional(),
  /** DevAI routing overrides for this request (never forwarded to providers) */
  devai: RoutingConfigSchema.optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatChoiceSchema = z.object({
  index: z.number(),
  message: ChatMessageSchema,
  finish_reason: z.string(),
});
export type ChatChoice = z.infer<typeof ChatChoiceSchema>;

export const ChatUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
});
export type ChatUsage = z.infer<typeof ChatUsageSchema>;

export const ChatResponseSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion'),
  created: z.number(),
  model: z.string(),
  choices: z.array(ChatChoiceSchema),
  usage: ChatUsageSchema,
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const ModelInfoSchema = z.object({
  id: z.string(),
  object: z.literal('model'),
  created: z.number(),
  owned_by: z.string(),
});
export type ModelInfo = z.infer<typeof ModelInfoSchema>;

export const ModelListResponseSchema = z.object({
  object: z.literal('list'),
  data: z.array(ModelInfoSchema),
});
export type ModelListResponse = z.infer<typeof ModelListResponseSchema>;

export const HealthStatusSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  providers: z.array(z.object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    latencyMs: z.number().optional(),
  })),
  redis: z.string(),
  database: z.string(),
  uptime: z.number(),
});
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const ErrorResponseSchema = z.object({
  error: z.object({
    type: z.string(),
    message: z.string(),
    request_id: z.string(),
    retry_after: z.number().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const UsageSummarySchema = z.object({
  requestCount: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
  cacheHitRate: z.number(),
  avgLatencyMs: z.number(),
  period: z.string(),
});
export type UsageSummary = z.infer<typeof UsageSummarySchema>;

export type AppEnv = {
  Variables: {
    requestId: string;
    projectId: string;
    project: any;
    /** Set on /admin routes: how the caller authenticated. */
    adminAuth?: { method: 'admin_key' } | { method: 'clerk'; userId: string; email?: string };
    /** Set on /user routes: the signed-in Clerk user, their plan and limits. */
    user?: { userId: string; plan: 'free' | 'student' | 'pro' | 'team'; isAdmin: boolean; limits: { pooledKeys: number | null; kits: boolean } };
    /** Set on /v1 routes when the API key belongs to a hackathon kit. */
    kit?: any;
  };
};

