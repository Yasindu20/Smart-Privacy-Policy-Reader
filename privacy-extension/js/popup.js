document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements 
    const initialView = document.getElementById('initial-view');
    const loadingView = document.getElementById('loading-view');
    const resultsView = document.getElementById('results-view');
    const errorView = document.getElementById('error-view');

    const policyDetectionMessage = document.getElementById('policy-detection-message');
    const policyUrlInput = document.getElementById('policy-url');
    const analyzeButton = document.getElementById('analyze-button');
    const backButton = document.getElementById('back-button');
    const errorBackButton = document.getElementById('error-back-button');
    const viewFullReportButton = document.getElementById('view-full-report-button');

    const scoreCircle = document.getElementById('score-circle');
    const scoreValue = document.getElementById('score-value');
    const scoreLabel = document.getElementById('score-label');
    const summaryList = document.getElementById('summary-list');
    const redFlagsList = document.getElementById('red-flags-list');
    const errorMessage = document.getElementById('error-message');
    
    // Loading spinner and message
    const loadingStatus = document.getElementById('loading-status');

    // Example URL items 
    const exampleItems = document.querySelectorAll('.examples li');

    // Get current active tab 
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const activeTab = tabs[0];

        // Check if current page is a privacy policy 
        chrome.storage.local.get([`tab_${activeTab.id}_has_policy`], async (result) => {
            const hasPolicy = result[`tab_${activeTab.id}_has_policy`];

            if (hasPolicy) {
                // Show "Privacy policy detected" message 
                policyDetectionMessage.classList.add('policy-detected');
                policyDetectionMessage.innerHTML = ` 
          <strong>Privacy policy detected!</strong><br> 
          Click analyze to get insights. 
        `;

                // Set the URL in the input field 
                policyUrlInput.value = activeTab.url;
            } else {
                // Show "No privacy policy detected" message 
                policyDetectionMessage.classList.add('no-policy-detected');
                policyDetectionMessage.innerHTML = ` 
          <strong>No privacy policy detected</strong><br> 
          Enter a privacy policy URL below. 
        `;
            }
        });
    });

    // Handle example URL clicks 
    exampleItems.forEach(item => {
        item.addEventListener('click', () => {
            policyUrlInput.value = item.getAttribute('data-url');
        });
    });

    // Handle analyze button click 
    analyzeButton.addEventListener('click', () => {
        const url = policyUrlInput.value.trim();
        if (!url) {
            alert('Please enter a valid URL');
            return;
        }
        
        // Show loading view 
        showView(loadingView);
        
        // Update loading status with more details
        updateLoadingStatus('Sending request to analyze privacy policy...');
        
        // Track request time for UX feedback
        const startTime = Date.now();
        
        // Send analysis request to background script 
        chrome.runtime.sendMessage({ action: 'analyzePolicy', url }, (response) => {
            // Ensure minimum of 1.5 seconds of loading for better UX
            const elapsedTime = Date.now() - startTime;
            const remainingTime = Math.max(0, 1500 - elapsedTime);
            
            setTimeout(() => {
                if (response.success) {
                    // Display the results 
                    displayResults(response.data);
                } else {
                    // Show error with detailed information
                    const errorDetails = response.error || 'Failed to analyze the privacy policy.';
                    const urlInfo = response.url ? `URL: ${response.url}` : '';
                    
                    errorMessage.innerHTML = `
                        <div>${errorDetails}</div>
                        ${urlInfo ? `<div class="error-url">${urlInfo}</div>` : ''}
                        <div class="error-tips">
                            <p>Possible solutions:</p>
                            <ul>
                                <li>Check if the URL is a valid privacy policy page</li>
                                <li>Ensure the backend server is running at http://localhost:3000</li>
                                <li>Try using one of the example URLs below</li>
                            </ul>
                        </div>
                    `;
                    
                    showView(errorView);
                }
            }, remainingTime);
        });
        
        // Set a timeout in case the background script doesn't respond
        setTimeout(() => {
            // Check if we're still in loading view after 30 seconds
            if (!initialView.classList.contains('hidden') && 
                !resultsView.classList.contains('hidden') && 
                !errorView.classList.contains('hidden')) {
                
                errorMessage.innerHTML = `
                    <div>Request timed out. The server took too long to respond.</div>
                    <div class="error-tips">
                        <p>Possible solutions:</p>
                        <ul>
                            <li>Check if the backend server is running</li>
                            <li>The policy might be too large to process</li>
                            <li>Try again or use one of the example URLs</li>
                        </ul>
                    </div>
                `;
                
                showView(errorView);
            }
        }, 30000);
    });

    // Handle back button clicks 
    backButton.addEventListener('click', () => {
        showView(initialView);
    });

    errorBackButton.addEventListener('click', () => {
        showView(initialView);
    });

    // Handle view full report button 
    viewFullReportButton.addEventListener('click', () => {
        // Get the policy ID from the stored analysis result 
        const policyId = window.policyResult?.policy?.id;
        if (policyId) {
            // Open the full report in a new tab 
            chrome.tabs.create({ url: `http://localhost:4200/results/${policyId}` });
        } else {
            alert('Unable to view full report. Please try analyzing the policy again.');
        }
    });
    
    // Function to update loading status
    function updateLoadingStatus(message) {
        if (loadingStatus) {
            loadingStatus.textContent = message;
        }
    }

    // Function to display results 
    function displayResults(data) {
        // Store the result globally for the "View Full Report" button 
        window.policyResult = data;
        const policy = data.policy;
        // Set the privacy score 
        const score = policy.score;
        scoreValue.textContent = score;
        // Determine score class 
        let scoreClass = 'poor';
        let labelText = 'Poor';
        if (score >= 80) {
            scoreClass = 'excellent';
            labelText = 'Excellent';
        } else if (score >= 70) {
            scoreClass = 'good';
            labelText = 'Good';
        } else if (score >= 50) {
            scoreClass = 'average';
            labelText = 'Average';
        } else if (score >= 30) {
            scoreClass = 'poor';
            labelText = 'Poor';
        } else {
            scoreClass = 'very-poor';
            labelText = 'Very Poor';
        }

        scoreCircle.className = 'score-circle ' + scoreClass;
        scoreLabel.textContent = labelText;

        // Set the summary 
        summaryList.innerHTML = '';
        
        try {
            const summaryPoints = typeof policy.summary === 'string' 
                ? JSON.parse(policy.summary) 
                : policy.summary;

            // Limit to 5 points for popup view 
            const limitedSummary = summaryPoints.slice(0, 5);
            limitedSummary.forEach(point => {
                const li = document.createElement('li');
                li.textContent = point;
                summaryList.appendChild(li);
            });
        } catch (error) {
            console.error('Error parsing summary:', error);
            const li = document.createElement('li');
            li.textContent = 'Error displaying summary. See full report for details.';
            summaryList.appendChild(li);
        }

        // Set the red flags 
        redFlagsList.innerHTML = '';
        
        try {
            const redFlags = typeof policy.red_flags === 'string' 
                ? JSON.parse(policy.red_flags) 
                : policy.red_flags;

            if (redFlags && redFlags.length > 0) {
                // Limit to 3 red flags for popup view 
                const limitedFlags = redFlags.slice(0, 3);
                limitedFlags.forEach(flag => {
                    const div = document.createElement('div');
                    div.className = 'red-flag-item';
                    div.textContent = flag;
                    redFlagsList.appendChild(div);
                });
            } else {
                const div = document.createElement('div');
                div.className = 'no-flags';
                div.textContent = 'No significant red flags detected.';
                redFlagsList.appendChild(div);
            }
        } catch (error) {
            console.error('Error parsing red flags:', error);
            const div = document.createElement('div');
            div.className = 'red-flag-item';
            div.textContent = 'Error displaying red flags. See full report for details.';
            redFlagsList.appendChild(div);
        }

        // Show the results view 
        showView(resultsView);
    }

    // Helper function to show a specific view 
    function showView(viewToShow) {
        // Hide all views 
        initialView.classList.add('hidden');
        loadingView.classList.add('hidden');
        resultsView.classList.add('hidden');
        errorView.classList.add('hidden');

        // Show the requested view 
        viewToShow.classList.remove('hidden');
    }
});