import { prisma } from '../db/client';

export interface ReplyVoiceProfileDTO {
  id?: string;
  name: string;
  enabled: boolean;
  tone: string;
  style: string;
  doList: string[];
  dontList: string[];
  examplePhrases: string[];
  bannedPhrases: string[];
}

const parseJsonArray = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter((s) => s.trim().length > 0);
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter((s) => s.trim().length > 0);
  } catch {
    // ignore
  }
  return [];
};

export const getActiveVoiceProfile = async (businessId: string): Promise<ReplyVoiceProfileDTO> => {
  const row = await prisma.replyVoiceProfile.findFirst({
    where: { businessId, enabled: true },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });

  if (!row) {
    return {
      name: 'Default',
      enabled: true,
      tone: 'warm, friendly, professional',
      style: 'concise and professional',
      doList: [],
      dontList: ['Never confirm someone is a patient.'],
      examplePhrases: [],
      bannedPhrases: [],
    };
  }

  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    tone: row.tone,
    style: row.style,
    doList: parseJsonArray(row.doListJson),
    dontList: parseJsonArray(row.dontListJson),
    examplePhrases: parseJsonArray(row.examplePhrasesJson),
    bannedPhrases: parseJsonArray(row.bannedPhrasesJson),
  };
};


