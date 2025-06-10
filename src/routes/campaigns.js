const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const { Email } = require('../models/Email');
const { sendHTMLEmail } = require('../services/emailService');

// Obtener todas las campañas
router.get('/', async (req, res) => {
    try {
        const campaigns = await Campaign.findAll({
            order: [['createdAt', 'DESC']]
        });
        res.render('campaigns', { campaigns });
    } catch (error) {
        console.error('Error al obtener campañas:', error);
        res.status(500).json({ error: 'Error al obtener campañas' });
    }
});

// Obtener correos de una campaña
router.get('/:campaignId/emails', async (req, res) => {
    try {
        const emails = await Email.findAll({
            where: { campaignId: req.params.campaignId },
            order: [['createdAt', 'DESC']]
        });
        res.json(emails);
    } catch (error) {
        console.error('Error al obtener correos de la campaña:', error);
        res.status(500).json({ error: 'Error al obtener correos de la campaña' });
    }
});

// Pausar una campaña
router.post('/:campaignId/pause', async (req, res) => {
    try {
        const campaign = await Campaign.findByPk(req.params.campaignId);
        if (!campaign) {
            return res.status(404).json({ error: 'Campaña no encontrada' });
        }

        await campaign.update({ status: 'paused' });
        res.json({ message: 'Campaña pausada exitosamente' });
    } catch (error) {
        console.error('Error al pausar la campaña:', error);
        res.status(500).json({ error: 'Error al pausar la campaña' });
    }
});

// Reanudar una campaña
router.post('/:campaignId/resume', async (req, res) => {
    try {
        const campaign = await Campaign.findByPk(req.params.campaignId);
        if (!campaign) {
            return res.status(404).json({ error: 'Campaña no encontrada' });
        }

        await campaign.update({ status: 'active' });
        res.json({ message: 'Campaña reanudada exitosamente' });
    } catch (error) {
        console.error('Error al reanudar la campaña:', error);
        res.status(500).json({ error: 'Error al reanudar la campaña' });
    }
});

// Reenviar un correo
router.post('/emails/:emailId/resend', async (req, res) => {
    try {
        const email = await Email.findByPk(req.params.emailId);
        if (!email) {
            return res.status(404).json({ error: 'Correo no encontrado' });
        }

        // Enviar el correo
        await sendHTMLEmail(email.toJSON());

        // Actualizar el estado
        await email.update({
            status: 'sent',
            sentAt: new Date()
        });

        res.json({ message: 'Correo reenviado exitosamente' });
    } catch (error) {
        console.error('Error al reenviar el correo:', error);
        res.status(500).json({ error: 'Error al reenviar el correo' });
    }
});

module.exports = router; 