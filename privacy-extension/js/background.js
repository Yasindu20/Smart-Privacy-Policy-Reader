// This script runs in the background 
// Listen for tab updates to detect navigation to privacy policy pages 
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only run when the page is fully loaded 
    if (changeInfo.status === 'complete' && tab.url) {
        // Check if the URL might be a privacy policy 
        const url = tab.url.toLowerCase();
        const policyKeywords = ['privacy', 'policy', 'privacypolicy', 'privacy-policy', 'datapolicy'];
        // If URL contains any privacy policy keywords 
        if (policyKeywords.some(keyword => url.includes(keyword))) {
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
            chrome.action.setBadgeText({ text: "!", tabId: tabId });
            chrome.action.setBadgeBackgroundColor({ color: "#ef4444", tabId: tabId });

            // Store that this tab likely has a privacy policy 
            chrome.storage.local.set({ [`tab_${tabId}_has_policy`]: true });
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
            chrome.storage.local.set({ [`tab_${tabId}_has_policy`]: false });
        }
    }
});

// Listen for messages from the popup or content scripts 
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "analyzePolicy") {
        console.log(`Analyzing policy: ${message.url}`);

        // Forward the analyze request to the API 
        analyzePrivacyPolicy(message.url)
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
});

// Function to analyze a privacy policy 
async function analyzePrivacyPolicy(url) {
    try {
        // Get API URL from options or use default
        const options = await chrome.storage.sync.get({
            useCustomApi: false,
            customApiUrl: 'http://localhost:3000/api/policies/analyze'
        });

        const apiUrl = options.useCustomApi ? options.customApiUrl : "http://localhost:3000/api/policies/analyze";

        console.log(`Making API request to: ${apiUrl}`);

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ url }),
            // Adding a longer timeout
            signal: AbortSignal.timeout(30000) // 30 second timeout
        });

        if (!response.ok) {
            let errorMessage = `Failed to analyze policy: Server responded with status ${response.status}`;

            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
            } catch (e) {
                // If JSON parsing fails, use the status text
                errorMessage = `Server error: ${response.statusText || 'Unknown error'}`;
            }

            throw new Error(errorMessage);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error analyzing policy:", error);
        // Add the URL to the error for better debugging
        error.message = `Failed to analyze ${url}: ${error.message}`;
        throw error;
    }
}