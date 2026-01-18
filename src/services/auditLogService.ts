import { prisma } from '../db/client';
import { sha256Hex } from './complianceGuard';

export type AuditAction =
  | 'APPROVE_REVIEW_REPLY'
  | 'POST_REVIEW_REPLY'
  | 'AUTO_POST_REVIEW_REPLY'
  | 'POST_GMB_POST';

export type AuditTargetType = 'REVIEW' | 'POST';

export interface AuditLogInput {
  businessId: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string | number | null;

  originalText: string;
  sanitizedText: string;
  violationCodes?: string[];
  metadata?: Record<string, any>;
}

export const logAuditEvent = async (input: AuditLogInput) => {
  const businessId = String(input.businessId || '');
  if (!businessId) throw new Error('businessId is required for audit logging');

  const originalText = String(input.originalText ?? '');
  const sanitizedText = String(input.sanitizedText ?? '');

  const originalSha256 = sha256Hex(originalText);
  const sanitizedSha256 = sha256Hex(sanitizedText);

  const violationCodes =
    input.violationCodes && Array.isArray(input.violationCodes) ? input.violationCodes.map(String) : [];

  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
  const violationCodesJson = violationCodes.length > 0 ? JSON.stringify(violationCodes) : null;

  const targetId =
    input.targetId === undefined || input.targetId === null ? null : String(input.targetId);

  return await prisma.auditEvent.create({
    data: {
      businessId,
      actorUserId: input.actorUserId ? String(input.actorUserId) : null,
      actorRole: input.actorRole ? String(input.actorRole) : null,
      action: input.action,
      targetType: input.targetType,
      targetId,
      originalSha256,
      sanitizedSha256,
      violationCodesJson,
      metadataJson,
    },
  });
};


