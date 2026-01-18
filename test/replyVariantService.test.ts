import { describe, expect, it } from 'vitest';

describe('replyVariantService', () => {
  it('deterministicVariant is stable for same id', async () => {
    const { deterministicVariant } = await import('../src/services/replyVariantService');
    const a1 = deterministicVariant('review_abc');
    const a2 = deterministicVariant('review_abc');
    expect(a1).toBe(a2);
    expect(a1 === 'A' || a1 === 'B').toBe(true);
  });
});


