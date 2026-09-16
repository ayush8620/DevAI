import { z } from 'zod';

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z.object({
  model: z.string().default('auto'),
  messages: z.array(ChatMessageSchema),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  top_p: z.number().optional(),
  stream: z.boolean().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  user: z.string().optional(),
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
  };
};

