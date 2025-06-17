// content.js 
// This script runs in the context of web pages 

// Function to check if the current page is likely a privacy policy 
function detectPrivacyPolicy() {
    // Check page title 
    const title = document.title.toLowerCase();
    const titleKeywords = ['privacy', 'policy', 'privacy policy', 'data policy'];
    const hasPolicyTitle = titleKeywords.some(keyword => title.includes(keyword));

    // Check main headings 
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
    const headingTexts = headings.map(h => h.textContent.toLowerCase());
    const hasPolicyHeading = headingTexts.some(text =>
        titleKeywords.some(keyword => text.includes(keyword))
    );

    // Check URL 
    const url = window.location.href.toLowerCase();
    const urlKeywords = ['privacy', 'policy', 'privacypolicy', 'privacy-policy'];
    const hasPolicyUrl = urlKeywords.some(keyword => url.includes(keyword));

    // Determine if this is likely a privacy policy 
    const isPrivacyPolicy = hasPolicyTitle || hasPolicyHeading || hasPolicyUrl;

    // Send message to background script 
    if (isPrivacyPolicy) {
        chrome.runtime.sendMessage({
            action: "policyDetected",
            url: window.location.href
        });
    }

    return isPrivacyPolicy;
}
// Run detection when page loads 
const isPolicyPage = detectPrivacyPolicy();
// Listen for messages from popup 
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "checkIfPolicy") {
        sendResponse({ isPolicy: isPolicyPage });
    }
    if (message.action === "getPageUrl") {
        sendResponse({ url: window.location.href });
    }
});
// If enabled in options, show a floating analyze button on policy pages 
if (isPolicyPage) {
    // Check if the feature is enabled first 
    chrome.storage.sync.get(['showFloatingButton'], (result) => {
        if (result.showFloatingButton !== false) { // Default to true 
            createFloatingButton();
        }
    });
}

function createFloatingButton() {
    const button = document.createElement('div');
    button.id = 'privacy-policy-analyzer-button';
    button.innerHTML = ` 
<div class="button-icon"> 
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 
24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" 
stroke-linejoin="round"> 
<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path> 
</svg> 
</div> 
<div class="button-text">Analyze Privacy Policy</div> 
`;

    button.addEventListener('click', () => {
        chrome.runtime.sendMessage({
            action: "analyzeFromPage",
            url: window.location.href
        });
    });

    document.body.appendChild(button);
}