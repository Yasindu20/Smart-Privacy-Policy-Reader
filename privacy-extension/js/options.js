// options.js 
document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements 
    const showFloatingButton = document.getElementById('show-floating-button');
    const showBadge = document.getElementById('show-badge');
    const useCustomApi = document.getElementById('use-custom-api');
    const customApiContainer = document.getElementById('custom-api-container');
    const customApiUrl = document.getElementById('custom-api-url');
    const saveButton = document.getElementById('save-button');
    const saveMessage = document.getElementById('save-message');

    // Load saved options 
    chrome.storage.sync.get({
        showFloatingButton: true,
        showBadge: true,
        useCustomApi: false,
        customApiUrl: 'http://localhost:3000/api/policies/analyze'
    }, (items) => {
        showFloatingButton.checked = items.showFloatingButton;
        showBadge.checked = items.showBadge;
        useCustomApi.checked = items.useCustomApi;
        customApiUrl.value = items.customApiUrl;

        // Show/hide custom API container 
        customApiContainer.style.display = items.useCustomApi ? 'block' : 'none';
    });

    // Toggle custom API input visibility 
    useCustomApi.addEventListener('change', () => {
        customApiContainer.style.display = useCustomApi.checked ? 'block' : 'none';
    });

    // Save options 
    saveButton.addEventListener('click', () => {
        chrome.storage.sync.set({
            showFloatingButton: showFloatingButton.checked,
            showBadge: showBadge.checked,
            useCustomApi: useCustomApi.checked,
            customApiUrl: customApiUrl.value
        }, () => {
            // Show saved message 
            saveMessage.style.display = 'block';

            // Hide message after 2 seconds 
            setTimeout(() => {
                saveMessage.style.display = 'none';
            }, 2000);
        });
    });
});