// src/routes/proxyRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { logger } = require('../middleware/errorHandler');
const cache = require('../utils/cacheManager');

// Add stealth plugin to puppeteer (prevents detection)
puppeteer.use(StealthPlugin());

/**
 * Proxy endpoint to fetch content from URLs that might block server-to-server requests
 */
router.post('/fetch', async (req, res) => {
  const startTime = Date.now();
  const { url, options = {} } = req.body;
  
  try {
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    logger.info(`Proxy fetch request for: ${url}`);
    
    // Check cache first unless explicitly skipped
    if (!options.skipCache) {
      const cacheKey = `proxy_${url}`;
      const cachedData = await cache.get(cacheKey);
      
      if (cachedData) {
        logger.info(`Using cached proxy data for ${url}`);
        
        const processingTime = Date.now() - startTime;
        return res.json({
          ...cachedData,
          cached: true,
          processingTime
        });
      }
    }
    
    // Choose fetch method based on options or URL pattern
    const useMethod = options.method || 'auto';
    
    // Determine if we should use puppeteer based on domain patterns
    let fetchMethod = useMethod;
    if (useMethod === 'auto') {
      const complexDomains = [
        'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
        'linkedin.com', 'tiktok.com', 'snapchat.com'
      ];
      
      const domain = new URL(url).hostname;
      const isComplexDomain = complexDomains.some(d => domain.includes(d));
      
      fetchMethod = isComplexDomain ? 'puppeteer' : 'axios';
    }
    
    let response;
    
    if (fetchMethod === 'puppeteer') {
      response = await fetchWithPuppeteer(url, options);
    } else {
      response = await fetchWithAxios(url, options);
    }
    
    // Cache the result unless explicitly skipped
    if (!options.skipCache) {
      const cacheKey = `proxy_${url}`;
      await cache.set(cacheKey, {
        url,
        content: response.content,
        status: response.status,
        headers: response.headers,
        method: fetchMethod
      }, 60 * 60 * 2); // Cache for 2 hours
    }
    
    const processingTime = Date.now() - startTime;
    logger.info(`Proxy fetch completed in ${processingTime}ms for ${url} using ${fetchMethod}`);
    
    res.json({
      url,
      content: response.content,
      status: response.status,
      headers: response.headers,
      method: fetchMethod,
      processingTime
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error(`Proxy fetch error (${processingTime}ms): ${error.message}`, {
      url,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Failed to fetch content',
      message: error.message,
      url
    });
  }
});

/**
 * Fetch content using Axios
 */
async function fetchWithAxios(url, options = {}) {
  try {
    const headers = {
      'User-Agent': options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Referer': options.referer || 'https://www.google.com/',
      ...options.headers
    };
    
    const timeout = options.timeout || 15000;
    const maxRedirects = options.maxRedirects || 5;
    
    const response = await axios({
      method: options.httpMethod || 'GET',
      url,
      headers,
      timeout,
      maxRedirects,
      validateStatus: status => status < 500, // Accept non-500 responses
      responseType: 'text'
    });
    
    return {
      content: response.data,
      status: response.status,
      headers: response.headers
    };
  } catch (error) {
    logger.error(`Axios fetch error for ${url}:`, error);
    throw new Error(`Axios fetch failed: ${error.message}`);
  }
}

/**
 * Fetch content using Puppeteer
 */
async function fetchWithPuppeteer(url, options = {}) {
  let browser;
  try {
    const launchOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas'
      ]
    };
    
    // Launch browser
    browser = await puppeteer.launch(launchOptions);
    
    // Create new page
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({
      width: options.width || 1366,
      height: options.height || 768
    });
    
    // Set user agent
    await page.setUserAgent(
      options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );
    
    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': options.referer || 'https://www.google.com/',
      ...options.headers
    });
    
    // Enable JavaScript
    await page.setJavaScriptEnabled(true);
    
    // Navigate to URL
    const response = await page.goto(url, {
      waitUntil: options.waitUntil || 'networkidle2',
      timeout: options.timeout || 30000
    });
    
    // Wait for extra time if specified
    if (options.extraWaitMs) {
      await page.waitForTimeout(options.extraWaitMs);
    }
    
    // Scroll if needed
    if (options.scroll !== false) {
      await autoScroll(page);
    }
    
    // Get content
    const content = await page.content();
    
    // Get response headers
    const headers = response.headers();
    
    // Get status code
    const status = response.status();
    
    return {
      content,
      status,
      headers
    };
  } catch (error) {
    logger.error(`Puppeteer fetch error for ${url}:`, error);
    throw new Error(`Puppeteer fetch failed: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Auto-scroll function for puppeteer
 */
async function autoScroll(page) {
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
}

module.exports = router;