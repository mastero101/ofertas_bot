const express = require('express');
const router = express.Router();
const StatisticsService = require('../services/statisticsService');

// Obtener estadísticas diarias
router.get('/daily', async (req, res) => {
    try {
        const { days, startDate, endDate } = req.query;
        
        let stats;
        if (startDate || endDate) {
            // Si se proporcionan fechas específicas, usar el rango de fechas
            stats = await StatisticsService.getDailyStatsByDateRange(startDate, endDate);
        } else {
            // Si no hay fechas, usar el parámetro days (por defecto 7)
            const daysCount = parseInt(days) || 7;
            stats = await StatisticsService.getDailyStats(daysCount);
        }
        
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

// Cancelar correo programado
router.delete('/scheduled/:emailId', async (req, res) => {
    try {
        const result = await StatisticsService.cancelScheduledEmail(req.params.emailId);
        res.json({ success: true, data: result });
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

// Obtener correos por estado
router.get('/emails', async (req, res) => {
    try {
        const { status, limit } = req.query;
        const emails = await StatisticsService.getEmailsByStatus(status, parseInt(limit) || 50);
        res.json({ success: true, data: emails });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener estadísticas por estado
router.get('/status-stats', async (req, res) => {
    try {
        const stats = await StatisticsService.getStatsByStatus();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router; 