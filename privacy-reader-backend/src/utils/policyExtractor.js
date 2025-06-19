// src/utils/policyExtractor.js
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { logger } = require('../middleware/errorHandler');
const cache = require('./cacheManager');

// Add stealth plugin to puppeteer (prevents detection)
puppeteer.use(StealthPlugin());

/**
 * Extracts domain from URL
 */
const extractDomain = (urlString) => {
  try {
    const parsedUrl = new URL(urlString);
    return parsedUrl.hostname;
  } catch (error) {
    logger.error(`Error parsing URL: ${urlString}`, error);
    return null;
  }
};

/**
 * Check if the URL is likely a privacy policy
 */
const isProbablyPrivacyPolicy = (url, html) => {
  // URL indicators
  const urlIndicators = [
    'privacy',
    'datapolicy',
    'data-policy',
    'privacypolicy',
    'privacy-policy',
    'datenschutz', // German
    'confidentialite', // French
    'privacidad', // Spanish
    'privacy-notice',
    'privacy-statement',
    'gdpr'
  ];
  
  // Check URL
  const urlLower = url.toLowerCase();
  const isUrlMatch = urlIndicators.some(indicator => urlLower.includes(indicator));
  
  if (isUrlMatch) {
    return true;
  }
  
  // Check content if URL doesn't match
  if (html) {
    const $ = cheerio.load(html);
    
    // Title indicators
    const titleText = $('title').text().toLowerCase();
    const h1Text = $('h1').text().toLowerCase();
    
    const titleIndicators = [
      'privacy',
      'policy',
      'data',
      'personal information',
      'cookie',
      'gdpr'
    ];
    
    // Check title
    const isTitleMatch = titleIndicators.some(indicator => 
      titleText.includes(indicator) || h1Text.includes(indicator)
    );
    
    if (isTitleMatch) {
      return true;
    }
    
    // Check for privacy-related keywords in the content
    const bodyText = $('body').text().toLowerCase();
    const contentKeywords = [
      'we collect',
      'information we collect',
      'personal data',
      'your rights',
      'data subject',
      'opt out',
      'third parties',
      'data protection',
      'controller',
      'processor',
      'legal basis'
    ];
    
    const keywordCount = contentKeywords.filter(keyword => 
      bodyText.includes(keyword)
    ).length;
    
    // If at least 4 privacy-related keywords are found, it's likely a privacy policy
    return keywordCount >= 4;
  }
  
  return false;
};

/**
 * Intelligent content extractor that works across different website structures
 */
const extractTextFromHtml = (html, url) => {
  const $ = cheerio.load(html);
  
  // Remove non-content elements
  $('script, style, meta, link, noscript, svg, iframe, nav, footer, header, [role="banner"], [role="navigation"]').remove();
  
  // Common selectors for privacy policies across different sites
  const commonSelectors = [
    // Specific privacy policy selectors
    '[data-testid="privacy-policy"]',
    '#privacy-policy',
    '.privacy-policy',
    '.privacy',
    '#privacy',
    '.policy-content',
    '.policy-text',
    '.legal-content',
    '.terms-content',
    
    // General content selectors
    'main',
    'article',
    '[role="main"]',
    '.main-content',
    '.content',
    '#content',
    '.container',
    '.page-content',
    '.entry-content',
    
    // Fallback selectors
    '.row',
    '.column',
    '.col',
    '.section'
  ];
  
  // Try to find the most likely content container
  let bestContent = '';
  let bestScore = 0;
  
  // First, try with common selectors
  for (const selector of commonSelectors) {
    const elements = $(selector);
    
    elements.each((i, el) => {
      const content = $(el).text().trim();
      const wordCount = content.split(/\s+/).length;
      
      // Skip empty or very short contents
      if (wordCount < 50) return;
      
      // Calculate a score based on word count and privacy-related terms
      const privacyTerms = [
        'privacy', 'data', 'information', 'collect', 'personal', 'share',
        'cookie', 'third party', 'gdpr', 'right', 'access', 'delete',
        'retention', 'security', 'protection', 'consent', 'process'
      ];
      
      let termsFound = 0;
      const contentLower = content.toLowerCase();
      privacyTerms.forEach(term => {
        if (contentLower.includes(term)) {
          termsFound++;
        }
      });
      
      // Score is based on length and privacy terms density
      const score = wordCount * (1 + (termsFound / privacyTerms.length * 2));
      
      if (score > bestScore) {
        bestScore = score;
        bestContent = content;
      }
    });
    
    // If we found good content with a selector, stop searching
    if (bestScore > 1000) {
      break;
    }
  }
  
  // If no good content found with selectors, look at all paragraphs
  if (bestScore < 500) {
    logger.info(`No suitable container found for ${url} using common selectors. Analyzing paragraphs.`);
    
    const paragraphs = $('p');
    let allParagraphsText = '';
    
    paragraphs.each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 20) { // Only include non-trivial paragraphs
        allParagraphsText += text + '\n\n';
      }
    });
    
    if (allParagraphsText.length > bestContent.length) {
      bestContent = allParagraphsText;
    }
  }
  
  // If still no good content, use the body as a last resort
  if (bestContent.length < 500) {
    logger.warn(`Falling back to body text for ${url}`);
    bestContent = $('body').text();
  }
  
  // Clean up the text
  return bestContent
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
};

/**
 * Extract metadata from HTML
 */
const extractMetadata = (html, url) => {
  const $ = cheerio.load(html);
  
  // Extract title
  const title = $('h1:contains("Privacy")').first().text() || 
                $('h1:contains("Policy")').first().text() ||
                $('title').text() ||
                'Privacy Policy';
  
  // Extract last updated date
  const lastUpdatedPatterns = [
    /last\s+(?:modified|updated|revised)(?:\s+on)?[\s:]+([A-Za-z0-9,\s]+\d{4})/i,
    /(?:effective|updated|revised|modified)(?:\s+date)?[\s:]+([A-Za-z0-9,\s]+\d{4})/i,
    /(?:date\s+of\s+last\s+revision|revision\s+date)[\s:]+([A-Za-z0-9,\s]+\d{4})/i
  ];
  
  let lastUpdated = null;
  const bodyText = $('body').text();
  
  for (const pattern of lastUpdatedPatterns) {
    const match = bodyText.match(pattern);
    if (match && match[1]) {
      lastUpdated = match[1].trim();
      break;
    }
  }
  
  // Extract company or site name
  let company = null;
  
  // Try from meta tags first
  const metaName = $('meta[property="og:site_name"]').attr('content') ||
                  $('meta[name="application-name"]').attr('content');
  
  if (metaName) {
    company = metaName;
  } else {
    // Try from domain name
    const domain = extractDomain(url);
    if (domain) {
      // Remove TLD and common subdomains
      company = domain
        .replace(/\.(com|org|net|io|gov|edu|co|app|ai)$/, '')
        .replace(/^(www|privacy|legal|help|support)\./, '');
      
      // Capitalize
      company = company.split('.')[0].charAt(0).toUpperCase() + company.split('.')[0].slice(1);
    }
  }
  
  return {
    title: title.trim(),
    lastUpdated,
    company
  };
};

/**
 * Fetch policy content using Axios with fallback to puppeteer for complex sites
 */
const fetchPolicyContent = async (policyUrl) => {
  const domain = extractDomain(policyUrl);
  logger.info(`Fetching policy content from ${policyUrl}`);
  
  // Check cache first
  const cacheKey = `policy_html_${policyUrl}`;
  const cachedData = await cache.get(cacheKey);
  
  if (cachedData) {
    logger.info(`Using cached HTML for ${policyUrl}`);
    return cachedData;
  }
  
  // Define known complex sites that need puppeteer
  const complexSites = [
    'facebook.com',
    'instagram.com',
    'twitter.com',
    'x.com',
    'apple.com',
    'microsoft.com',
    'linkedin.com',
    'amazon.com',
    'netflix.com',
    'tiktok.com',
    'snapchat.com'
  ];
  
  // Decide whether to use Axios or Puppeteer
  const needsPuppeteer = complexSites.some(site => domain?.includes(site));
  
  try {
    let html;
    
    if (needsPuppeteer) {
      logger.info(`Using Puppeteer for complex site: ${domain}`);
      html = await fetchWithPuppeteer(policyUrl);
    } else {
      // Try with axios first
      try {
        html = await fetchWithAxios(policyUrl);
      } catch (axiosError) {
        logger.warn(`Axios failed for ${policyUrl}, falling back to Puppeteer`);
        html = await fetchWithPuppeteer(policyUrl);
      }
    }
    
    // Cache the result
    await cache.set(cacheKey, html, 60 * 60 * 24); // Cache for 24 hours
    
    return html;
  } catch (error) {
    logger.error(`Failed to fetch policy from ${policyUrl}:`, error);
    throw new Error(`Failed to fetch policy from ${policyUrl}: ${error.message}`);
  }
};

/**
 * Fetch using Axios
 */
const fetchWithAxios = async (url) => {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
  
  const response = await axios.get(url, {
    headers: {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Referer': 'https://www.google.com/'
    },
    timeout: 15000,
    maxRedirects: 5
  });
  
  return response.data;
};

/**
 * Fetch using Puppeteer (for JavaScript-heavy sites)
 */
const fetchWithPuppeteer = async (url) => {
  let browser;
  try {
    // Launch headless browser with stealth mode
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set a realistic viewport
    await page.setViewport({ width: 1366, height: 768 });
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    
    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.google.com/'
    });
    
    // Navigate to the URL with timeout
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait a bit more for JavaScript execution
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Scroll down to load lazy content
    await autoScroll(page);
    
    // Get the HTML content
    const html = await page.content();
    
    return html;
  } catch (error) {
    logger.error(`Puppeteer error for ${url}:`, error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

/**
 * Auto-scroll function for puppeteer to load lazy content
 */
const autoScroll = async (page) => {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        
        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
};

/**
 * Process a privacy policy URL with advanced error handling and recovery
 */
const processPrivacyPolicy = async (policyUrl) => {
  logger.info(`Processing policy URL: ${policyUrl}`);
  const startTime = Date.now();
  
  try {
    const domain = extractDomain(policyUrl);
    
    if (!domain) {
      throw new Error(`Invalid URL: ${policyUrl}`);
    }
    
    // Fetch HTML content
    const html = await fetchPolicyContent(policyUrl);
    
    if (!html || html.length < 100) {
      throw new Error(`Retrieved HTML content is too short or empty from ${policyUrl}`);
    }
    
    logger.info(`Successfully fetched HTML from ${policyUrl} (length: ${html.length})`);
    
    // Verify if this is likely a privacy policy
    if (!isProbablyPrivacyPolicy(policyUrl, html)) {
      logger.warn(`URL ${policyUrl} does not appear to be a privacy policy`);
      // Continue anyway, but add a warning flag
    }
    
    // Extract text content
    const text = extractTextFromHtml(html, policyUrl);
    
    // Extract metadata
    const metadata = extractMetadata(html, policyUrl);
    
    if (!text || text.length < 200) {
      throw new Error(`Failed to extract meaningful text content from ${policyUrl}`);
    }
    
    logger.info(`Successfully extracted text (length: ${text.length}) and metadata from ${policyUrl}`);
    
    // Limit text length for API processing
    const truncatedText = text.length > 100000 
      ? text.slice(0, 100000) + '... [text truncated due to length]'
      : text;
    
    const processingTime = Date.now() - startTime;
    logger.info(`Policy processing completed in ${processingTime}ms for ${policyUrl}`);
    
    return {
      url: policyUrl,
      domain,
      title: metadata.title,
      company: metadata.company,
      lastUpdated: metadata.lastUpdated,
      text: truncatedText,
      extractionMethod: html.includes('__NEXT_DATA__') ? 'puppeteer' : 'axios',
      processingTime
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error(`Error processing policy (${processingTime}ms): ${error.message}`, {
      url: policyUrl,
      stack: error.stack
    });
    throw error;
  }
};

module.exports = {
  processPrivacyPolicy,
  extractDomain,
  isProbablyPrivacyPolicy
};