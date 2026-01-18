import { describe, expect, it } from 'vitest';
import { runComplianceGuard, sha256Hex } from '../src/services/complianceGuard';

describe('complianceGuard', () => {
  it('sha256Hex is stable', () => {
    expect(sha256Hex('hello')).toBe(sha256Hex('hello'));
    expect(sha256Hex('hello')).not.toBe(sha256Hex('hello!'));
  });

  it('sanitizes never-confirm-patient language (does not block)', () => {
    const res = runComplianceGuard({
      target: 'review_reply',
      text: 'As your dentist, we loved seeing you for your appointment!',
      reviewComment: 'Great staff!',
      bannedPhrases: [],
    });
    expect(res.blocked).toBe(false);
    expect(res.violations.some((v) => v.code === 'NeverConfirmPatient')).toBe(true);
    expect(res.sanitizedText.toLowerCase()).toContain('for your privacy');
  });

  it('redacts banned phrases', () => {
    const res = runComplianceGuard({
      target: 'gmb_post',
      text: 'This is a SECRET_OFFER just for you.',
      bannedPhrases: ['secret_offer'],
    });
    expect(res.blocked).toBe(false);
    expect(res.violations.some((v) => v.code === 'BannedPhraseMatch')).toBe(true);
    expect(res.sanitizedText).toContain('[redacted]');
  });

  it('blocks high-confidence PHI markers', () => {
    const res = runComplianceGuard({
      target: 'review_reply',
      text: 'DOB: 01/02/2000 please confirm.',
      reviewComment: 'Thanks',
      bannedPhrases: [],
    });
    expect(res.blocked).toBe(true);
    expect(res.violations.some((v) => v.code === 'HighConfidencePHI')).toBe(true);
  });
});


