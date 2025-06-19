// This script runs in the background and handles privacy policy detection, analysis, and API integration

// Constants
const DEFAULT_API_URL = 'http://localhost:3000/api';
const STORAGE_KEYS = {
  API_URL: 'api_url',
  API_KEY: 'api_key',
  TOKEN: 'auth_token',
  USER: 'user',
  SETTINGS: 'settings',
  POLICY_CACHE: 'policy_cache'
};
const DEFAULT_SETTINGS = {
  autoDetectPolicies: true,
  useCachedResults: true,
  showNotifications: true,
  cacheExpiry: 7, // days
  showBadge: true,
  darkMode: false,
  theme: 'default'
};

// Initialize
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Privacy Policy Analyzer extension installed/updated');
  
  // Set default settings if not already set
  const settings = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  if (!settings[STORAGE_KEYS.SETTINGS]) {
    await chrome.storage.sync.set({ 
      [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS,
      [STORAGE_KEYS.API_URL]: DEFAULT_API_URL
    });
  }
  
  // Clear old caches
  await clearExpiredCache();
});

// Listen for tab updates to detect navigation to privacy policy pages
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only run when the page is fully loaded 
  if (changeInfo.status === 'complete' && tab.url) {
    // Get settings
    const { settings } = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
    
    if (settings?.autoDetectPolicies !== false) {
      // Check if the URL might be a privacy policy 
      const url = tab.url.toLowerCase();
      const isPolicyUrl = detectPrivacyPolicyUrl(url);
      
      if (isPolicyUrl) {
        console.log(`Detected potential privacy policy: ${url}`);
        
        // Show the extension's icon in an active state 
        chrome.action.setIcon({
          path: {
            "16": "images/icon16-active.png",
            "48": "images/icon48-active.png",
            "128": "images/icon128-active.png"
          },
          tabId: tabId
        });

        // Set a badge to indicate a privacy policy was detected
        if (settings?.showBadge !== false) {
          chrome.action.setBadgeText({ text: "!", tabId: tabId });
          chrome.action.setBadgeBackgroundColor({ color: "#ef4444", tabId: tabId });
        }

        // Store that this tab likely has a privacy policy 
        await chrome.storage.local.set({ [`tab_${tabId}_has_policy`]: true });
        
        // Store the URL for this tab
        await chrome.storage.local.set({ [`tab_${tabId}_url`]: url });
        
        // Show notification if enabled
        if (settings?.showNotifications) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'images/icon128-active.png',
            title: 'Privacy Policy Detected',
            message: 'Click the extension icon to analyze this privacy policy.'
          });
        }
      } else {
        // Reset to default icon 
        chrome.action.setIcon({
          path: {
            "16": "images/icon16.png",
            "48": "images/icon48.png",
            "128": "images/icon128.png"
          },
          tabId: tabId
        });

        // Clear the badge 
        chrome.action.setBadgeText({ text: "", tabId: tabId });

        // Store that this tab doesn't have a privacy policy 
        await chrome.storage.local.set({ [`tab_${tabId}_has_policy`]: false });
      }
    }
  }
});

// Listen for messages from the popup or content scripts 
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "analyzePolicy") {
    console.log(`Analyzing policy: ${message.url}`);
    
    // Forward the analyze request to the API 
    analyzePrivacyPolicy(message.url, message.options)
      .then(result => {
        console.log("Analysis completed successfully");
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error("Analysis failed:", error);
        sendResponse({ 
          success: false, 
          error: error.message,
          url: message.url
        });
      });

    // Return true to indicate we'll respond asynchronously 
    return true;
  }
  
  if (message.action === "getSettings") {
    getSettings()
      .then(settings => {
        sendResponse({ success: true, settings });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
  
  if (message.action === "saveSettings") {
    saveSettings(message.settings)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
  
  if (message.action === "getAuthStatus") {
    getAuthStatus()
      .then(status => {
        sendResponse({ success: true, ...status });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
  
  if (message.action === "login") {
    login(message.email, message.password)
      .then(result => {
        sendResponse({ success: true, ...result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
  
  if (message.action === "logout") {
    logout()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
  
  if (message.action === "getCachedPolicies") {
    getCachedPolicies()
      .then(policies => {
        sendResponse({ success: true, policies });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
});

/**
 * Analyze a privacy policy using the API
 */
async function analyzePrivacyPolicy(url, options = {}) {
  try {
    // Check if we have a cached version first
    if (!options.forceFresh) {
      const cachedPolicy = await getCachedPolicy(url);
      
      if (cachedPolicy) {
        console.log(`Using cached analysis for ${url}`);
        return cachedPolicy;
      }
    }
    
    // Get API URL from options or use default
    const { api_url } = await chrome.storage.sync.get(STORAGE_KEYS.API_URL);
    const apiUrl = api_url || DEFAULT_API_URL;
    
    console.log(`Making API request to: ${apiUrl}/policies/analyze`);
    
    // Get authentication token if available
    let headers = {
      "Content-Type": "application/json"
    };
    
    const { auth_token } = await chrome.storage.sync.get(STORAGE_KEYS.TOKEN);
    if (auth_token) {
      headers["Authorization"] = `Bearer ${auth_token}`;
    } else {
      // Try API key if no token
      const { api_key } = await chrome.storage.sync.get(STORAGE_KEYS.API_KEY);
      if (api_key) {
        headers["X-API-Key"] = api_key;
      }
    }
    
    const response = await fetch(`${apiUrl}/policies/analyze`, {
      method: "POST",
      headers,
      body: JSON.stringify({ 
        url,
        options 
      })
    });

    if (!response.ok) {
      let errorMessage = `Failed to analyze policy: Server responded with status ${response.status}`;
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorData.message || errorMessage;
      } catch (e) {
        // If JSON parsing fails, use the status text
        errorMessage = `Server error: ${response.statusText || 'Unknown error'}`;
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // Cache the result
    await cachePolicy(url, data);
    
    return data;
  } catch (error) {
    console.error("Error analyzing policy:", error);
    throw error;
  }
}

/**
 * Detect if a URL is likely a privacy policy
 */
function detectPrivacyPolicyUrl(url) {
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
  
  // Check URL against indicators
  return urlIndicators.some(indicator => url.includes(indicator));
}

/**
 * Get a cached policy by URL
 */
async function getCachedPolicy(url) {
  try {
    // Get settings for cache expiry
    const { settings } = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
    const cacheExpiryDays = settings?.cacheExpiry || 7;
    
    // Get cache
    const cacheData = await chrome.storage.local.get(STORAGE_KEYS.POLICY_CACHE);
    const cache = cacheData[STORAGE_KEYS.POLICY_CACHE] || {};
    
    // Check if URL is in cache
    if (cache[url]) {
      const cachedTime = new Date(cache[url].timestamp);
      const now = new Date();
      const expiryTime = new Date(cachedTime.getTime() + (cacheExpiryDays * 24 * 60 * 60 * 1000));
      
      // Check if cache is still valid
      if (now < expiryTime) {
        return cache[url].data;
      } else {
        console.log(`Cache expired for ${url}`);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error getting cached policy:', error);
    return null;
  }
}

/**
 * Cache a policy result
 */
async function cachePolicy(url, data) {
  try {
    // Get current cache
    const cacheData = await chrome.storage.local.get(STORAGE_KEYS.POLICY_CACHE);
    const cache = cacheData[STORAGE_KEYS.POLICY_CACHE] || {};
    
    // Add new entry
    cache[url] = {
      data,
      timestamp: new Date().toISOString()
    };
    
    // Save updated cache
    await chrome.storage.local.set({ [STORAGE_KEYS.POLICY_CACHE]: cache });
    
    return true;
  } catch (error) {
    console.error('Error caching policy:', error);
    return false;
  }
}

/**
 * Clear expired cache entries
 */
async function clearExpiredCache() {
  try {
    // Get settings for cache expiry
    const { settings } = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
    const cacheExpiryDays = settings?.cacheExpiry || 7;
    
    // Get cache
    const cacheData = await chrome.storage.local.get(STORAGE_KEYS.POLICY_CACHE);
    const cache = cacheData[STORAGE_KEYS.POLICY_CACHE] || {};
    
    const now = new Date();
    const newCache = {};
    let removedCount = 0;
    
    // Check each entry
    Object.keys(cache).forEach(url => {
      const cachedTime = new Date(cache[url].timestamp);
      const expiryTime = new Date(cachedTime.getTime() + (cacheExpiryDays * 24 * 60 * 60 * 1000));
      
      if (now < expiryTime) {
        // Keep valid entries
        newCache[url] = cache[url];
      } else {
        // Remove expired entries
        removedCount++;
      }
    });
    
    if (removedCount > 0) {
      console.log(`Cleared ${removedCount} expired cache entries`);
      await chrome.storage.local.set({ [STORAGE_KEYS.POLICY_CACHE]: newCache });
    }
    
    return removedCount;
  } catch (error) {
    console.error('Error clearing expired cache:', error);
    return 0;
  }
}

/**
 * Get cached policies
 */
async function getCachedPolicies() {
  try {
    const cacheData = await chrome.storage.local.get(STORAGE_KEYS.POLICY_CACHE);
    const cache = cacheData[STORAGE_KEYS.POLICY_CACHE] || {};
    
    // Transform to array of policies with metadata
    return Object.keys(cache).map(url => ({
      url,
      timestamp: cache[url].timestamp,
      data: cache[url].data
    })).sort((a, b) => {
      // Sort by timestamp (newest first)
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
  } catch (error) {
    console.error('Error getting cached policies:', error);
    throw error;
  }
}

/**
 * Get extension settings
 */
async function getSettings() {
  try {
    const { settings } = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
    return settings || DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Error getting settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save extension settings
 */
async function saveSettings(newSettings) {
  try {
    // Merge with default settings
    const settings = { ...DEFAULT_SETTINGS, ...newSettings };
    
    await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: settings });
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    throw error;
  }
}

/**
 * Get authentication status
 */
async function getAuthStatus() {
  try {
    const { auth_token, user, api_key } = await chrome.storage.sync.get([
      STORAGE_KEYS.TOKEN,
      STORAGE_KEYS.USER,
      STORAGE_KEYS.API_KEY
    ]);
    
    return {
      isAuthenticated: !!auth_token,
      hasApiKey: !!api_key,
      user: user || null
    };
  } catch (error) {
    console.error('Error getting auth status:', error);
    throw error;
  }
}

/**
 * Login with email and password
 */
async function login(email, password) {
  try {
    // Get API URL
    const { api_url } = await chrome.storage.sync.get(STORAGE_KEYS.API_URL);
    const apiUrl = api_url || DEFAULT_API_URL;
    
    const response = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || errorData.message || 'Login failed');
    }
    
    const data = await response.json();
    
    // Save token and user data
    await chrome.storage.sync.set({
      [STORAGE_KEYS.TOKEN]: data.token,
      [STORAGE_KEYS.USER]: data.user,
      [STORAGE_KEYS.API_KEY]: data.user.apiKey
    });
    
    return {
      token: data.token,
      user: data.user
    };
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

/**
 * Logout
 */
async function logout() {
  try {
    await chrome.storage.sync.remove([
      STORAGE_KEYS.TOKEN,
      STORAGE_KEYS.USER
    ]);
    
    return true;
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
}