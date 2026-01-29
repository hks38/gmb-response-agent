import * as cheerio from 'cheerio';
import { URL } from 'url';

export interface PracticeInfo {
  practice_name: string;
  location: string;
  phone: string;
  email?: string;
  address?: string;
  services: string[];
  specialty_services?: string[]; // Advanced procedures like veneers, implants, all-on-x, etc.
  insurance_carriers?: string[]; // Insurance companies accepted
  full_text_content?: string; // Aggregated text from all pages for AI analysis
  description?: string;
  unique_selling_points: string[];
  meta_description?: string;
  url: string;
  pagesScraped?: number;
  totalPagesFound?: number;
}

/**
 * Fetch all pages from a website using sitemap or crawling
 */
export const fetchWebsiteContent = async (url: string): Promise<PracticeInfo> => {
  try {
    const baseUrl = new URL(url);
    const domain = baseUrl.origin;
    
    console.log(`Starting comprehensive scrape of ${domain}...`);
    
    // Step 1: Try to discover all pages via sitemap
    let allUrls: string[] = await discoverPagesViaSitemap(domain);
    
    // Step 2: If no sitemap, crawl internal links
    if (allUrls.length === 0) {
      console.log('No sitemap found, crawling internal links...');
      allUrls = await crawlInternalLinks(url, domain);
    }
    
    // Ensure homepage is included
    if (!allUrls.includes(domain) && !allUrls.includes(url)) {
      allUrls.unshift(url);
    }
    
    // Limit to prevent excessive scraping (max 100 pages)
    allUrls = allUrls.slice(0, 100);
    console.log(`Found ${allUrls.length} pages to scrape`);
    
    // Step 3: Scrape all pages and aggregate content
    const aggregatedData = await scrapeAllPages(allUrls, domain);
    
    return {
      ...aggregatedData,
      url,
      pagesScraped: allUrls.length,
      totalPagesFound: allUrls.length,
    };
  } catch (error) {
    console.error(`Error fetching website ${url}:`, error);
    // Fallback to single page scrape
    try {
      return await fetchSinglePage(url);
    } catch (fallbackError) {
      console.error(`Fallback scrape also failed:`, fallbackError);
      // Return minimal fallback data
      return getFallbackInfo(url);
    }
  }
};

/**
 * Discover all pages using sitemap
 */
async function discoverPagesViaSitemap(domain: string): Promise<string[]> {
  const urls: string[] = [];
  const sitemapUrls: string[] = [];
  
  try {
    // First, check robots.txt for sitemap reference
    try {
      const robotsResponse = await fetch(`${domain}/robots.txt`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (robotsResponse.ok) {
        const robotsText = await robotsResponse.text();
        // Match all Sitemap lines (can be multiple)
        const sitemapMatches = robotsText.matchAll(/Sitemap:\s*(.+)/gi);
        for (const match of sitemapMatches) {
          if (match[1]) {
            sitemapUrls.push(match[1].trim());
          }
        }
      }
    } catch (e) {
      // Ignore robots.txt errors
    }
    
    // Add default sitemap locations if not found in robots.txt
    if (sitemapUrls.length === 0) {
      sitemapUrls.push(
        `${domain}/sitemap.xml`,
        `${domain}/sitemap_index.xml`
      );
    }
    
    // Try each sitemap URL
    for (const sitemapUrl of sitemapUrls) {
      try {
        // Skip robots.txt if it somehow got added
        if (sitemapUrl.includes('/robots.txt')) continue;
        
        const response = await fetch(sitemapUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        
        if (!response.ok) continue;
        
        const xml = await response.text();
        
        // Check if it's a sitemap index (contains <sitemapindex>)
        if (xml.includes('<sitemapindex>')) {
          // Parse sitemap index to get individual sitemaps
          const $ = cheerio.load(xml, { xmlMode: true });
          const sitemapLinks: string[] = [];
          
          $('sitemap > loc').each((_, el) => {
            const loc = $(el).text().trim();
            if (loc) sitemapLinks.push(loc);
          });
          
          // Fetch URLs from each sitemap in the index
          for (const sitemapLink of sitemapLinks.slice(0, 10)) {
            try {
              const sitemapResponse = await fetch(sitemapLink, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
              });
              if (sitemapResponse.ok) {
                const sitemapXml = await sitemapResponse.text();
                const sitemapUrls = parseSitemapUrls(sitemapXml);
                urls.push(...sitemapUrls);
              }
            } catch (e) {
              console.warn(`Failed to fetch sitemap ${sitemapLink}:`, e);
            }
          }
        } else {
          // Regular sitemap
          const sitemapUrls = parseSitemapUrls(xml);
          urls.push(...sitemapUrls);
        }
        
        // If we found URLs, break (don't check other sitemap URLs)
        if (urls.length > 0) {
          console.log(`Found ${urls.length} URLs from sitemap: ${sitemapUrl}`);
          break;
        }
      } catch (e) {
        // Continue to next sitemap URL
        continue;
      }
    }
  } catch (error) {
    console.warn('Error discovering pages via sitemap:', error);
  }
  
  // Deduplicate and filter to same domain
  const domainObj = new URL(domain);
  return Array.from(new Set(urls))
    .filter(url => {
      try {
        const urlObj = new URL(url);
        return urlObj.origin === domainObj.origin;
      } catch {
        return false;
      }
    });
}

/**
 * Parse URLs from sitemap XML
 */
function parseSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const $ = cheerio.load(xml, { xmlMode: true });
  
  $('url > loc').each((_, el) => {
    const loc = $(el).text().trim();
    if (loc) {
      urls.push(loc);
    }
  });
  
  return urls;
}

/**
 * Crawl internal links when no sitemap exists
 */
async function crawlInternalLinks(startUrl: string, domain: string): Promise<string[]> {
  const visited = new Set<string>();
  const toVisit = [startUrl];
  const domainObj = new URL(domain);
  const maxPages = 100;
  
  while (toVisit.length > 0 && visited.size < maxPages) {
    const currentUrl = toVisit.shift()!;
    
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);
    
    try {
      const response = await fetch(currentUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      
      if (!response.ok) continue;
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Find all links on the page
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        
        try {
          // Resolve relative URLs
          const absoluteUrl = new URL(href, currentUrl).href;
          const urlObj = new URL(absoluteUrl);
          
          // Only include same-domain, same-protocol URLs
          if (
            urlObj.origin === domainObj.origin &&
            urlObj.protocol === domainObj.protocol &&
            !visited.has(absoluteUrl) &&
            !absoluteUrl.includes('#') &&
            !absoluteUrl.includes('mailto:') &&
            !absoluteUrl.includes('tel:') &&
            !absoluteUrl.match(/\.(pdf|jpg|jpeg|png|gif|svg|zip|doc|docx|xls|xlsx|css|js)$/i)
          ) {
            toVisit.push(absoluteUrl);
          }
        } catch {
          // Invalid URL, skip
        }
      });
    } catch (error) {
      console.warn(`Error crawling ${currentUrl}:`, error);
    }
  }
  
  console.log(`Crawled ${visited.size} pages via link crawling`);
  return Array.from(visited);
}

/**
 * Scrape all pages and aggregate content
 */
async function scrapeAllPages(urls: string[], domain: string): Promise<PracticeInfo> {
  const allData: {
    practice_names: Map<string, number>; // name -> count
    locations: Map<string, number>;
    phones: Map<string, number>;
    emails: Map<string, number>;
    addresses: Map<string, number>;
    services: Set<string>;
    specialty_services: Set<string>;
    insurance_carriers: Set<string>;
    full_text_content: string[]; // Store text from all pages
    descriptions: string[];
    unique_selling_points: Set<string>;
    meta_descriptions: string[];
    homepageData: PracticeInfo | null;
  } = {
    practice_names: new Map(),
    locations: new Map(),
    phones: new Map(),
    emails: new Map(),
    addresses: new Map(),
    services: new Set(),
    specialty_services: new Set(),
    insurance_carriers: new Set(),
    full_text_content: [],
    descriptions: [],
    unique_selling_points: new Set(),
    meta_descriptions: [],
    homepageData: null,
  };
  
  // Scrape pages in parallel (with concurrency limit)
  const concurrency = 5;
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (url) => {
        try {
          const pageData = await fetchSinglePage(url);
          
          // Check if this is the homepage
          const urlObj = new URL(url);
          const isHomepage = urlObj.pathname === '/' || urlObj.pathname === '' || urlObj.href === domain;
          
          if (isHomepage) {
            allData.homepageData = pageData;
          }
          
          // Aggregate data with frequency counting
          if (pageData.practice_name) {
            allData.practice_names.set(pageData.practice_name, (allData.practice_names.get(pageData.practice_name) || 0) + 1);
          }
          if (pageData.location) {
            allData.locations.set(pageData.location, (allData.locations.get(pageData.location) || 0) + 1);
          }
          if (pageData.phone) {
            allData.phones.set(pageData.phone, (allData.phones.get(pageData.phone) || 0) + 1);
          }
          if (pageData.email) {
            allData.emails.set(pageData.email, (allData.emails.get(pageData.email) || 0) + 1);
          }
          if (pageData.address) {
            allData.addresses.set(pageData.address, (allData.addresses.get(pageData.address) || 0) + 1);
          }
          pageData.services.forEach(s => allData.services.add(s));
          if (pageData.specialty_services) {
            pageData.specialty_services.forEach(s => allData.specialty_services.add(s));
          }
          if (pageData.insurance_carriers) {
            pageData.insurance_carriers.forEach(ic => allData.insurance_carriers.add(ic));
          }
          if (pageData.full_text_content) {
            allData.full_text_content.push(pageData.full_text_content);
          }
          if (pageData.description) allData.descriptions.push(pageData.description);
          pageData.unique_selling_points.forEach(usp => allData.unique_selling_points.add(usp));
          if (pageData.meta_description) allData.meta_descriptions.push(pageData.meta_description);
        } catch (error) {
          console.warn(`Failed to scrape ${url}:`, error);
        }
      })
    );
    
    // Small delay between batches to be respectful
    if (i + concurrency < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Helper function to get most common value from map
  const getMostCommon = <T>(map: Map<T, number>, fallback: T): T => {
    let maxCount = 0;
    let mostCommon = fallback;
    for (const [key, count] of map.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = key;
      }
    }
    return mostCommon;
  };
  
  // Prefer homepage data if available, otherwise use most common values
  const homepageData = allData.homepageData;
  
  // Combine full text content from all pages (limit to 100k chars)
  const combinedFullText = allData.full_text_content
    .join('\n\n')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100000);

  return {
    practice_name: homepageData?.practice_name || getMostCommon(allData.practice_names, 'Dental Practice'),
    location: homepageData?.location || getMostCommon(allData.locations, 'Location TBD'),
    phone: homepageData?.phone || getMostCommon(allData.phones, ''),
    email: homepageData?.email || getMostCommon(allData.emails, undefined),
    address: homepageData?.address || getMostCommon(allData.addresses, undefined),
    services: Array.from(allData.services).slice(0, 20), // Limit services
    specialty_services: Array.from(allData.specialty_services).length > 0 
      ? Array.from(allData.specialty_services).slice(0, 30)
      : undefined,
    insurance_carriers: Array.from(allData.insurance_carriers).length > 0
      ? Array.from(allData.insurance_carriers).slice(0, 30)
      : undefined,
    full_text_content: combinedFullText.length > 0 ? combinedFullText : undefined,
    description: homepageData?.description || allData.descriptions[0] || allData.descriptions.join(' ').substring(0, 1000),
    unique_selling_points: Array.from(allData.unique_selling_points).slice(0, 15),
    meta_description: homepageData?.meta_description || allData.meta_descriptions[0] || undefined,
    url: domain,
  };
}

/**
 * Fetch a single page (fallback or individual page scraping)
 */
async function fetchSinglePage(url: string): Promise<PracticeInfo> {
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
    const specialty_services = extractSpecialtyServices($);
    const insurance_carriers = extractInsuranceCarriers($);
    const description = extractDescription($);
    const unique_selling_points = extractUSPs($);
    const meta_description = $('meta[name="description"]').attr('content') || undefined;
    
    // Extract full text content for AI analysis (remove scripts, styles, etc.)
    // Remove navigation, footer, header but keep main content
    $('script, style, nav, footer, header, [class*="navigation" i], [class*="nav" i], [class*="footer" i], [class*="header" i], [role="navigation"], [role="banner"], [role="contentinfo"]').remove();
    
    // Get text from main content areas, prioritizing actual content
    let full_text_content = '';
    const mainContent = $('main, article, [class*="content" i], [class*="main" i], [role="main"], .content, #content, #main').text();
    const bodyText = $('body').text();
    
    // Prefer main content, fall back to body text
    full_text_content = (mainContent || bodyText)
      .replace(/\s+/g, ' ')
      .trim();
    
    // Limit to 50k characters per page
    if (full_text_content.length > 50000) {
      full_text_content = full_text_content.substring(0, 50000);
    }

    return {
      practice_name,
      location,
      phone,
      email,
      address,
      services,
      specialty_services: specialty_services.length > 0 ? specialty_services : undefined,
      insurance_carriers: insurance_carriers.length > 0 ? insurance_carriers : undefined,
      full_text_content: full_text_content.length > 0 ? full_text_content : undefined,
      description,
      unique_selling_points,
      meta_description,
      url,
    };
  } catch (error) {
    console.error(`Error fetching page ${url}:`, error);
    throw error;
  }
}

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

/**
 * Extract specialty services (advanced procedures)
 */
const extractSpecialtyServices = ($: cheerio.CheerioAPI): string[] => {
  const specialtyServices: string[] = [];
  const specialtyKeywords = [
    // Implant procedures
    'dental implants',
    'dental implant',
    'implant',
    'implant dentistry',
    'all-on-4',
    'all on 4',
    'all-on-4 dental implants',
    'all on four',
    'all-on-x',
    'all on x',
    'all-on-x dental implants',
    'implant-supported dentures',
    'implant dentures',
    'mini implants',
    'mini dental implants',
    'immediate load implants',
    'same-day implants',
    // Cosmetic procedures
    'veneers',
    'dental veneers',
    'porcelain veneers',
    'lumineers',
    'composite veneers',
    'teeth whitening',
    'zoom whitening',
    'in-office whitening',
    'smile makeover',
    'cosmetic dentistry',
    // Restorative procedures
    'root canal',
    'root canal therapy',
    'endodontics',
    'endodontic treatment',
    'dental crowns',
    'crowns',
    'dental bridges',
    'bridges',
    'dental bonding',
    'bonding',
    'inlays',
    'onlays',
    // Oral surgery
    'oral surgery',
    'wisdom teeth removal',
    'wisdom tooth extraction',
    'tooth extraction',
    'surgical extractions',
    'bone grafting',
    'sinus lift',
    'socket preservation',
    // Periodontal procedures
    'periodontics',
    'gum disease treatment',
    'scaling and root planing',
    'deep cleaning',
    'gum grafting',
    'pocket reduction',
    // Orthodontics
    'orthodontics',
    'braces',
    'invisalign',
    'clear aligners',
    'retainers',
    // Specialty procedures
    'tmj treatment',
    'sleep apnea treatment',
    'snoring treatment',
    'botox',
    'dermal fillers',
    'sedation dentistry',
    'iv sedation',
    'nitrous oxide',
  ];

  const text = $.text().toLowerCase();

  for (const keyword of specialtyKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      // Format the service name properly
      let serviceName = keyword
        .split(/\s+/)
        .map((w) => {
          // Handle special cases like "all-on-4"
          if (w.includes('-')) {
            return w.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('-');
          }
          return w.charAt(0).toUpperCase() + w.slice(1);
        })
        .join(' ');
      
      // Clean up common variations
      if (serviceName.toLowerCase().includes('all on') && !serviceName.toLowerCase().includes('all-on')) {
        serviceName = serviceName.replace(/all on/gi, 'All-On');
      }
      
      if (serviceName && !specialtyServices.includes(serviceName)) {
        specialtyServices.push(serviceName);
      }
    }
  }

  // Also check service sections for specialty services
  $('[class*="service" i], [class*="treatment" i], [class*="procedure" i]').each((_, el) => {
    const sectionText = $(el).text().toLowerCase();
    $(el)
      .find('h2, h3, h4, h5, li, p')
      .each((_, element) => {
        const elementText = $(element).text().trim();
        if (elementText.length > 0 && elementText.length < 100) {
          for (const keyword of specialtyKeywords) {
            if (elementText.toLowerCase().includes(keyword.toLowerCase())) {
              const serviceName = elementText.trim();
              if (!specialtyServices.includes(serviceName) && serviceName.length < 80) {
                specialtyServices.push(serviceName);
              }
            }
          }
        }
      });
  });

  return specialtyServices;
};

/**
 * Extract insurance carriers from website content
 */
const extractInsuranceCarriers = ($: cheerio.CheerioAPI): string[] => {
  const insuranceCarriers: string[] = [];
  const text = $.text();
  
  // Common insurance carrier names and patterns
  const insurancePatterns = [
    // Major insurance companies
    /\b(Aetna|AETNA)\b/gi,
    /\b(Cigna|CIGNA)\b/gi,
    /\b(Delta Dental|Delta)\b/gi,
    /\b(Blue Cross|Blue Shield|BlueCross|BlueShield|BCBS)\b/gi,
    /\b(MetLife|Met Life)\b/gi,
    /\b(UnitedHealth|United Healthcare|United Health)\b/gi,
    /\b(Humana|HUMANA)\b/gi,
    /\b(Anthem|ANTHEM)\b/gi,
    /\b(Guardian|GUARDIAN)\b/gi,
    /\b(Principal|PRINCIPAL)\b/gi,
    /\b(Ameritas|AMERITAS)\b/gi,
    /\b(Assurant|ASSURANT)\b/gi,
    /\b(BCN|Blue Care Network)\b/gi,
    /\b(CareFirst|Care First)\b/gi,
    /\b(Premera|PREMERA)\b/gi,
    /\b(Regence|REGENCE)\b/gi,
    // PPO/HMO mentions
    /\b(PPO|HMO|DHMO|DPPO)\b/gi,
    // Medicaid/Medicare
    /\b(Medicaid|MEDICAID)\b/gi,
    /\b(Medicare|MEDICARE)\b/gi,
    // State-specific
    /\b(Tricare|TRICARE|TRICARE Dental)\b/gi,
    // Other common patterns
    /\b(Accepted Insurance|Insurance Accepted|We Accept|Accept Most Insurance)\b/gi,
    /\b(In-Network|In Network|Out-of-Network|Out of Network)\b/gi,
  ];

  // Check insurance sections specifically
  $('[class*="insurance" i], [id*="insurance" i], [class*="accepted" i], [id*="accepted" i]').each((_, el) => {
    const sectionText = $(el).text();
    
    for (const pattern of insurancePatterns) {
      const matches = sectionText.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const carrier = match.trim();
          if (carrier && !insuranceCarriers.includes(carrier) && carrier.length < 50) {
            // Normalize carrier names
            let normalized = carrier;
            if (/^blue\s*(cross|shield)/i.test(carrier)) {
              normalized = 'Blue Cross Blue Shield';
            } else if (/^delta\s*dental/i.test(carrier)) {
              normalized = 'Delta Dental';
            } else if (/^united\s*health/i.test(carrier)) {
              normalized = 'UnitedHealthcare';
            } else if (/^met\s*life/i.test(carrier)) {
              normalized = 'MetLife';
            } else {
              normalized = carrier.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            }
            
            if (!insuranceCarriers.includes(normalized)) {
              insuranceCarriers.push(normalized);
            }
          }
        });
      }
    }
  });

  // Also search full page text if insurance section not found
  if (insuranceCarriers.length === 0) {
    for (const pattern of insurancePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const carrier = match.trim();
          if (carrier && !insuranceCarriers.includes(carrier) && carrier.length < 50) {
            let normalized = carrier;
            if (/^blue\s*(cross|shield)/i.test(carrier)) {
              normalized = 'Blue Cross Blue Shield';
            } else if (/^delta\s*dental/i.test(carrier)) {
              normalized = 'Delta Dental';
            } else if (/^united\s*health/i.test(carrier)) {
              normalized = 'UnitedHealthcare';
            } else if (/^met\s*life/i.test(carrier)) {
              normalized = 'MetLife';
            } else {
              normalized = carrier.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            }
            
            if (!insuranceCarriers.includes(normalized)) {
              insuranceCarriers.push(normalized);
            }
          }
        });
      }
    }
  }

  // Remove generic terms like "PPO" or "HMO" if we found specific carriers
  if (insuranceCarriers.length > 1) {
    return insuranceCarriers.filter(c => 
      !/^(PPO|HMO|DHMO|DPPO|In-Network|Out-of-Network)$/i.test(c)
    );
  }

  return insuranceCarriers.slice(0, 30); // Limit to 30 carriers
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
      specialty_services: [
        'Dental Implants',
        'Veneers',
        'Root Canal',
        'All-On-4',
        'Invisalign',
      ],
      insurance_carriers: [],
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
    practice_name: 'Dental Practice',
    location: 'Location TBD',
    phone: '',
    services: [],
    specialty_services: [],
    insurance_carriers: [],
    unique_selling_points: [],
    url,
  };
};

