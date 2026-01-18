import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client';
import { requireRole } from '../middleware/rbac';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });

    const templates = await prisma.replyTemplate.findMany({
      where: { businessId: tenant.businessId },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    });

    res.json({ success: true, templates });
  } catch (err: any) {
    console.error('Failed to list reply templates', err);
    res.status(500).json({ success: false, error: 'Failed to list reply templates', message: err.message });
  }
});

const TemplateSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  ratingMin: z.number().int().min(1).max(5).optional(),
  ratingMax: z.number().int().min(1).max(5).optional(),
  sentiment: z.string().optional().nullable(),
  topicsJson: z.string().optional().nullable(),
  languageCode: z.string().optional().nullable(),
  instructions: z.string().optional().nullable(),
  bodyTemplate: z.string().optional().nullable(),
  variantHintsJson: z.string().optional().nullable(),
});

router.post('/', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });
    const data = TemplateSchema.parse(req.body || {});

    if (typeof data.ratingMin === 'number' && typeof data.ratingMax === 'number' && data.ratingMin > data.ratingMax) {
      return res.status(400).json({ error: 'ratingMin must be <= ratingMax' });
    }

    const created = await prisma.replyTemplate.create({
      data: {
        businessId: tenant.businessId,
        name: data.name,
        enabled: data.enabled ?? true,
        priority: data.priority ?? 0,
        ratingMin: data.ratingMin ?? 1,
        ratingMax: data.ratingMax ?? 5,
        sentiment: data.sentiment ?? null,
        topicsJson: data.topicsJson ?? null,
        languageCode: data.languageCode ?? null,
        instructions: data.instructions ?? null,
        bodyTemplate: data.bodyTemplate ?? null,
        variantHintsJson: data.variantHintsJson ?? null,
      },
    });

    res.json({ success: true, template: created });
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ success: false, error: 'Invalid template', details: err.errors });
    console.error('Failed to create reply template', err);
    res.status(500).json({ success: false, error: 'Failed to create reply template', message: err.message });
  }
});

router.put('/:id', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });

    const id = String(req.params.id);
    const patch = TemplateSchema.partial().parse(req.body || {});

    if (typeof patch.ratingMin === 'number' && typeof patch.ratingMax === 'number' && patch.ratingMin > patch.ratingMax) {
      return res.status(400).json({ error: 'ratingMin must be <= ratingMax' });
    }

    const existing = await prisma.replyTemplate.findFirst({ where: { id, businessId: tenant.businessId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const updated = await prisma.replyTemplate.update({
      where: { id },
      data: patch as any,
    });

    res.json({ success: true, template: updated });
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ success: false, error: 'Invalid template', details: err.errors });
    console.error('Failed to update reply template', err);
    res.status(500).json({ success: false, error: 'Failed to update reply template', message: err.message });
  }
});

router.delete('/:id', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });

    const id = String(req.params.id);
    const existing = await prisma.replyTemplate.findFirst({ where: { id, businessId: tenant.businessId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await prisma.replyTemplate.delete({ where: { id } });
    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to delete reply template', err);
    res.status(500).json({ success: false, error: 'Failed to delete reply template', message: err.message });
  }
});

export default router;


