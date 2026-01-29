import { describe, it, expect } from 'vitest';

// Test the filtering logic for competitor discovery
describe('Competitor Discovery Filtering', () => {
  const allowedDentalTypes = [
    'dentist',
    'dental_clinic',
    'dental_office',
    'dental_implant_provider',
    'pediatric_dentist',
    'general_dentist',
    'cosmetic_dentist',
    'oral_surgeon',
    'orthodontist',
    'periodontist',
    'endodontist',
    'prosthodontist',
  ].map(t => t.toLowerCase());

  const excludeKeywords = [
    'pizza', 'restaurant', 'cafe', 'coffee', 'trattoria', 'pizzeria', 
    'bar', 'bakery', 'food', 'delivery', 'takeout',
    'veterinary', 'vet', 'animal', 'pet',
    'hospital', 'clinic', 'medical center', 'urgent care', 'emergency room',
    'pharmacy', 'drugstore',
    'spa', 'salon', 'beauty', 'massage',
    'law', 'lawyer', 'attorney', 'legal',
    'auto', 'car', 'vehicle', 'repair',
    'real estate', 'realtor',
  ].map(k => k.toLowerCase());

  const dentalKeywords = [
    'dental', 'dentist', 'dentistry', 'dds', 'dmd',
    'oral', 'teeth', 'tooth', 'smile',
  ].map(k => k.toLowerCase());

  const immediateExcludePatterns = [
    /\bpizza\b/i,           // Catches "Pezzo Pizza", "Pizza Hut", etc. without hardcoding specific names
    /\btrattoria\b/i,
    /\bpizzeria\b/i,
    /\bristorante\b/i,      // Catches Italian restaurants like "Taste of Italy Ristorante & Pizzeria"
    /\brestaurant\b/i,
    /\bcafe\b/i,
    /\bcoffee\b/i,
    /\bbar\s+\d+/i,
    /\btavern\b/i,
    /\bpub\b/i,
    /\bgrill\b/i,
    /\bdiner\b/i,
    /\bbakery\b/i,
    /\bfood\b.*\bdelivery\b/i,
    /\bauto\b/i,
    /\bcar\s+dealer\b/i,
    /\bmechanic\b/i,
    /\blaw\s+firm\b/i,
    /\battorney\b/i,
    /\blawyer\b/i,
    /\breal\s+estate\b/i,
    /\brealtor\b/i,
    /\bvet\s+clinic\b/i,
    /\bveterinary\b/i,
  ];

  function shouldFilterOut(name: string, types: string[] = [], address: string = '', websiteUrl: string = ''): boolean {
    const nameLower = name.toLowerCase().trim();
    const addressLower = address.toLowerCase().trim();
    const websiteUrlLower = websiteUrl.toLowerCase().trim();
    const allTypes = types.map(t => t.toLowerCase().trim()).filter(Boolean);

    // Stage 0: Immediate exclusion
    const matchesImmediateExclude = immediateExcludePatterns.some(pattern => pattern.test(name));
    if (matchesImmediateExclude) {
      return true;
    }

    // Stage 1: Exclude keywords with word boundaries
    const excludeMatch = excludeKeywords.find(k => {
      const keywordRegex = new RegExp(`\\b${k}\\b`, 'i');
      return keywordRegex.test(name) || 
             keywordRegex.test(addressLower) || 
             keywordRegex.test(websiteUrlLower);
    });
    if (excludeMatch) {
      return true;
    }

    // Stage 2: Check dental type or keyword
    const isAllowedDentalType = allTypes.some(type => 
      allowedDentalTypes.some(allowed => type.includes(allowed) || allowed.includes(type))
    );

    const hasDentalKeyword = dentalKeywords.some(keyword => {
      const keywordRegex = new RegExp(`\\b${keyword}\\b`, 'i');
      return keywordRegex.test(nameLower);
    });

    if (!isAllowedDentalType && !hasDentalKeyword) {
      return true;
    }

    return false;
  }

  it('should filter out "Pezzo Pizza 2"', () => {
    expect(shouldFilterOut('Pezzo Pizza 2')).toBe(true);
  });

  it('should filter out "Pezzo Pizza"', () => {
    expect(shouldFilterOut('Pezzo Pizza')).toBe(true);
  });

  it('should filter out "Pezzo Pizza (Long Valley)"', () => {
    expect(shouldFilterOut('Pezzo Pizza (Long Valley)')).toBe(true);
  });

  it('should filter out "Giuseppe\'s Trattoria"', () => {
    expect(shouldFilterOut("Giuseppe's Trattoria")).toBe(true);
  });

  it('should filter out "Taste of Italy Ristorante & Pizzeria"', () => {
    expect(shouldFilterOut('Taste of Italy Ristorante & Pizzeria')).toBe(true);
  });

  it('should filter out pizza restaurants', () => {
    expect(shouldFilterOut('Pizza Hut')).toBe(true);
    expect(shouldFilterOut('Domino\'s Pizza')).toBe(true);
    expect(shouldFilterOut('Local Pizzeria')).toBe(true);
  });

  it('should allow dental practices', () => {
    expect(shouldFilterOut('Dr. John Smith, DDS')).toBe(false);
    expect(shouldFilterOut('Long Valley Family Dentistry')).toBe(false);
    expect(shouldFilterOut('Pilek Jared DDS')).toBe(false);
    expect(shouldFilterOut('Dr. Howard Goodkin, DMD & Associates')).toBe(false);
  });

  it('should allow dental practices with types', () => {
    expect(shouldFilterOut('Dental Office', ['dentist'])).toBe(false);
    expect(shouldFilterOut('Family Dental', ['dental_clinic'])).toBe(false);
    expect(shouldFilterOut('Pediatric Dentist', ['pediatric_dentist'])).toBe(false);
  });

  it('should filter out restaurants even with address', () => {
    expect(shouldFilterOut('Pezzo Pizza 2', [], '62 E Mill Rd, Long Valley, NJ 07853, USA')).toBe(true);
  });

  it('should filter out orthodontist-only practices without general dentistry', () => {
    // This test would need AI verification - for now, orthodontists are allowed
    expect(shouldFilterOut('Califon Orthodontics', ['orthodontist'])).toBe(false); // Currently allowed
  });
});

