const express = require('express'); 
const router = express.Router(); 
const policyController = require('../controllers/policyController'); 
 
// Analyze a privacy policy 
router.post('/analyze', policyController.analyzePolicy); 
 
// Get policy history 
router.get('/:id/history', policyController.getPolicyHistory); 
 
// Get policy by ID 
router.get('/:id', policyController.getPolicyById); 
 
module.exports = router;
