// privacy-reader-backend/src/routes/proxyRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Proxy endpoint to fetch content from URLs that might block server-to-server requests
 */
router.post('/fetch', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        console.log(`Proxy fetch request for: ${url}`);

        // Use a browser-like user agent
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': 'https://www.google.com/'
            },
            timeout: 15000,
            maxRedirects: 5
        });

        res.json({
            url: url,
            content: response.data,
            status: response.status,
            headers: response.headers
        });
    } catch (error) {
        console.error('Proxy fetch error:', error);

        res.status(500).json({
            error: 'Failed to fetch content',
            message: error.message,
            url: req.body.url
        });
    }
});

module.exports = router;