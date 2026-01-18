export const normalizeReviewReplyText = (input: {
  text: string;
  reviewerFirstName: string;
  signature: string;
}): string => {
  const reviewerFirstName = String(input.reviewerFirstName || 'Valued Patient').trim() || 'Valued Patient';
  const signature = String(input.signature || '').trim();

  let out = String(input.text || '').trim();

  // Remove common bracket placeholders
  out = out.replace(/\[Your Name\][\s,.-]*/gi, '');
  out = out.replace(/\[Name\][\s,.-]*/gi, '');
  out = out.replace(/\[Reviewer's Name\]/gi, reviewerFirstName);
  out = out.replace(/\[Reviewer Name\]/gi, reviewerFirstName);
  out = out.replace(/\[Reviewer\]/gi, reviewerFirstName);

  // Ensure greeting
  if (!/^Dear\s/i.test(out)) {
    out = `Dear ${reviewerFirstName},\n\n${out}`;
  }
  out = out.replace(/^Dear\s+[^,\n]+,?/i, `Dear ${reviewerFirstName},`);

  // Strip any existing closing lines that look like signatures, then append ours
  if (signature) {
    out = out.replace(/\n\s*(Warm regards|Best regards|Sincerely|Kind regards|Regards),?[\s\S]*$/i, '').trim();
    out = out.replace(/\n\s*\[.*?\]\s*$/gim, '').trim();
    out = `${out}\n\n${signature}`.trim();
  }

  // Collapse 3+ newlines to 2
  out = out.replace(/\n{3,}/g, '\n\n').trim();

  return out;
};


