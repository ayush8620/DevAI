/** Pure decision on the gateway's /admin/me answer (unit-tested). */
export function isAdminMeResponse(status: number, body: unknown): body is { data: { method: 'clerk'; userId: string; email?: string | null } } {
  const d = (body as any)?.data;
  return status === 200 && d?.method === 'clerk' && typeof d.userId === 'string';
}
