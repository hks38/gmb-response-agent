import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client';
import { requireRole } from '../middleware/rbac';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });

    const voices = await prisma.replyVoiceProfile.findMany({
      where: { businessId: tenant.businessId },
      orderBy: [{ updatedAt: 'desc' }],
    });

    res.json({ success: true, voices });
  } catch (err: any) {
    console.error('Failed to list voice profiles', err);
    res.status(500).json({ success: false, error: 'Failed to list voice profiles', message: err.message });
  }
});

const VoiceSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  tone: z.string().optional(),
  style: z.string().optional(),
  doListJson: z.string().optional().nullable(),
  dontListJson: z.string().optional().nullable(),
  examplePhrasesJson: z.string().optional().nullable(),
  bannedPhrasesJson: z.string().optional().nullable(),
});

router.post('/', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });

    const data = VoiceSchema.parse(req.body || {});
    const created = await prisma.replyVoiceProfile.create({
      data: {
        businessId: tenant.businessId,
        name: data.name,
        enabled: data.enabled ?? true,
        tone: data.tone ?? 'warm, friendly, professional',
        style: data.style ?? 'concise and professional',
        doListJson: data.doListJson ?? null,
        dontListJson: data.dontListJson ?? null,
        examplePhrasesJson: data.examplePhrasesJson ?? null,
        bannedPhrasesJson: data.bannedPhrasesJson ?? null,
      },
    });

    res.json({ success: true, voice: created });
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ success: false, error: 'Invalid voice profile', details: err.errors });
    console.error('Failed to create voice profile', err);
    res.status(500).json({ success: false, error: 'Failed to create voice profile', message: err.message });
  }
});

router.put('/:id', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });

    const id = String(req.params.id);
    const patch = VoiceSchema.partial().parse(req.body || {});

    const existing = await prisma.replyVoiceProfile.findFirst({ where: { id, businessId: tenant.businessId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const updated = await prisma.replyVoiceProfile.update({
      where: { id },
      data: patch as any,
    });

    res.json({ success: true, voice: updated });
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ success: false, error: 'Invalid voice profile', details: err.errors });
    console.error('Failed to update voice profile', err);
    res.status(500).json({ success: false, error: 'Failed to update voice profile', message: err.message });
  }
});

router.delete('/:id', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });

    const id = String(req.params.id);
    const existing = await prisma.replyVoiceProfile.findFirst({ where: { id, businessId: tenant.businessId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await prisma.replyVoiceProfile.delete({ where: { id } });
    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to delete voice profile', err);
    res.status(500).json({ success: false, error: 'Failed to delete voice profile', message: err.message });
  }
});

export default router;


