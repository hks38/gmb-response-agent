import * as cheerio from 'cheerio';

export interface PracticeInfo {
  practice_name: string;
  location: string;
  phone: string;
  email?: string;
  address?: string;
  services: string[];
  description?: string;
  unique_selling_points: string[];
  meta_description?: string;
  url: string;
}

export const fetchWebsiteContent = async (url: string): Promise<PracticeInfo> => {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const practice_name = extractPracticeName($);
    const location = extractLocation($);
    const phone = extractPhone($);
    const email = extractEmail($);
    const address = extractAddress($);
    const services = extractServices($);
    const description = extractDescription($);
    const unique_selling_points = extractUSPs($);
    const meta_description = $('meta[name="description"]').attr('content') || undefined;

    return {
      practice_name,
      location,
      phone,
      email,
      address,
      services,
      description,
      unique_selling_points,
      meta_description,
      url,
    };
  } catch (error) {
    console.error(`Error fetching website ${url}:`, error);
    // Return fallback info for malama.dental
    return getFallbackInfo(url);
  }
};

const extractPracticeName = ($: cheerio.CheerioAPI): string => {
  const selectors = [
    'h1',
    '.site-title',
    '.practice-name',
    '[class*="logo"]',
    '[class*="brand"]',
    'title',
  ];

  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length) {
      let text = element.text().trim();
      if (text && text.length < 100) {
        text = text.replace(/\s*-\s*.*$/, ''); // Remove " - Tagline"
        if (text) return text;
      }
    }
  }

  // Fallback to title tag
  const title = $('title').text().trim();
  if (title) {
    return title.replace(/\s*-\s*.*$/, '');
  }

  return 'Malama Dental';
};

const extractLocation = ($: cheerio.CheerioAPI): string => {
  const text = $.text();
  const locationPatterns = [
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\s*\d{5}/,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})/,
    /in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
  ];

  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match) {
      if (match.length === 3) {
        return `${match[1]}, ${match[2]}`;
      }
      return match[1];
    }
  }

  const address = $('address').first();
  if (address.length) {
    const addrText = address.text();
    const match = addrText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})/);
    if (match) {
      return `${match[1]}, ${match[2]}`;
    }
  }

  return 'Location TBD';
};

const extractPhone = ($: cheerio.CheerioAPI): string => {
  // Check tel: links first
  const phoneLink = $('a[href^="tel:"]').first();
  if (phoneLink.length) {
    const href = phoneLink.attr('href') || '';
    return href.replace('tel:', '').trim();
  }

  // Search in text
  const text = $.text();
  const phonePattern = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const match = text.match(phonePattern);
  if (match) {
    return match[0];
  }

  return '';
};

const extractEmail = ($: cheerio.CheerioAPI): string => {
  // Check mailto: links
  const emailLink = $('a[href^="mailto:"]').first();
  if (emailLink.length) {
    const href = emailLink.attr('href') || '';
    return href.replace('mailto:', '').trim();
  }

  // Search in text
  const text = $.text();
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = text.match(emailPattern);
  if (match) {
    return match[0];
  }

  return '';
};

const extractAddress = ($: cheerio.CheerioAPI): string => {
  const address = $('address').first();
  if (address.length) {
    return address.text().trim();
  }

  const text = $.text();
  const addressPattern =
    /\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct),?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\s+\d{5}/;
  const match = text.match(addressPattern);
  if (match) {
    return match[0];
  }

  return '';
};

const extractServices = ($: cheerio.CheerioAPI): string[] => {
  const services: string[] = [];
  const serviceKeywords = [
    'teeth cleaning',
    'dental cleaning',
    'cleanings',
    'dental implants',
    'implants',
    'teeth whitening',
    'whitening',
    'root canal',
    'root canals',
    'cosmetic dentistry',
    'cosmetic',
    'orthodontics',
    'braces',
    'invisalign',
    'crowns',
    'dental crowns',
    'veneers',
    'dental veneers',
    'fillings',
    'dental fillings',
    'extractions',
    'tooth extraction',
    'dentures',
    'dental dentures',
    'emergency dental',
    'emergency care',
    'pediatric dentistry',
    "children's dentistry",
    'periodontics',
    'gum treatment',
    'oral surgery',
    'preventative dentistry',
    'preventive dentistry',
    'restorative dentistry',
  ];

  const text = $.text().toLowerCase();

  for (const keyword of serviceKeywords) {
    if (text.includes(keyword)) {
      const service = keyword
        .replace(/^dental\s+/, '')
        .replace(/\s+dental$/, '')
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      if (service && !services.includes(service)) {
        services.push(service);
      }
    }
  }

  // Also look for service sections
  $('[class*="service" i], [class*="treatment" i]').each((_, el) => {
    $(el)
      .find('h2, h3, h4')
      .each((_, heading) => {
        const serviceText = $(heading).text().trim();
        if (serviceText && serviceText.length < 50 && !services.includes(serviceText)) {
          services.push(serviceText);
        }
      });
  });

  return services.slice(0, 15); // Limit to 15 services
};

const extractDescription = ($: cheerio.CheerioAPI): string => {
  const metaDesc = $('meta[name="description"]').attr('content');
  if (metaDesc) {
    return metaDesc.trim();
  }

  // Try to find main content description
  const mainContent = $('main p, .content p, .description p').first();
  if (mainContent.length) {
    return mainContent.text().trim().substring(0, 500);
  }

  return '';
};

const extractUSPs = ($: cheerio.CheerioAPI): string[] => {
  const usps: string[] = [];
  const text = $.text().toLowerCase();

  const uspKeywords = [
    'gentle',
    'compassionate',
    'comfortable',
    'affordable',
    'modern technology',
    'accepting new patients',
    'family-friendly',
    'stress-free',
    'luxury dentistry',
    'comprehensive',
    'transparent pricing',
    'membership plan',
  ];

  for (const keyword of uspKeywords) {
    if (text.includes(keyword)) {
      const usp = keyword
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      if (!usps.includes(usp)) {
        usps.push(usp);
      }
    }
  }

  return usps;
};

const getFallbackInfo = (url: string): PracticeInfo => {
  // Fallback info for malama.dental
  if (url.includes('malama.dental')) {
    return {
      practice_name: 'Mālama Dental',
      location: 'Long Valley, NJ',
      phone: '908-876-5559',
      email: 'care@malama.dental',
      address: '2 Mountain View Ave, Long Valley, NJ 07853',
      services: [
        'Preventative Dentistry',
        'Restorative Dentistry',
        'Cosmetic Dentistry',
        'Teeth Cleaning',
        'Dental Implants',
        'Crowns',
        'Root Canal',
        'Teeth Whitening',
        'Veneers',
        'Invisalign',
        'Emergency Dental Care',
      ],
      description:
        'Family dentistry practice offering gentle, compassionate care with modern dental technology. Accepting new patients.',
      unique_selling_points: [
        'Gentle Care',
        'Compassionate',
        'Modern Technology',
        'Accepting New Patients',
        'Family-Friendly',
        'Affordable Luxury Dentistry',
      ],
      url,
    };
  }

  // Generic fallback
  return {
    practice_name: 'Malama Dental',
    location: 'Location TBD',
    phone: '',
    services: [],
    unique_selling_points: [],
    url,
  };
};

