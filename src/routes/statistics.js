const express = require('express');
const router = express.Router();
const StatisticsService = require('../services/statisticsService');

// Obtener estadísticas diarias
router.get('/daily', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const stats = await StatisticsService.getDailyStats(days);
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener estadísticas de una campaña específica
router.get('/campaign/:campaignId', async (req, res) => {
    try {
        const stats = await StatisticsService.getCampaignStats(req.params.campaignId);
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener correos programados
router.get('/scheduled', async (req, res) => {
    try {
        const emails = await StatisticsService.getScheduledEmails();
        res.json({ success: true, data: emails });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Actualizar correo programado
router.put('/scheduled/:emailId', async (req, res) => {
    try {
        const email = await StatisticsService.updateScheduledEmail(req.params.emailId, req.body);
        res.json({ success: true, data: email });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener estadísticas generales
router.get('/general', async (req, res) => {
    try {
        const stats = await StatisticsService.getGeneralStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router; 