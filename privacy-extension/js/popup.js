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
        // Send analysis request to background script 
        chrome.runtime.sendMessage({ action: 'analyzePolicy', url }, (response) => {
            if (response.success) {
                // Display the results 
                displayResults(response.data);
            } else {
                // Show error 
                errorMessage.textContent = response.error || 'Failed to analyze the privacy policy.';
                showView(errorView);
            }
        });
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
        const summaryPoints = JSON.parse(policy.summary);

        // Limit to 5 points for popup view 
        const limitedSummary = summaryPoints.slice(0, 5);
        limitedSummary.forEach(point => {
            const li = document.createElement('li');
            li.textContent = point;
            summaryList.appendChild(li);
        });

        // Set the red flags 
        redFlagsList.innerHTML = '';
        const redFlags = JSON.parse(policy.red_flags);

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