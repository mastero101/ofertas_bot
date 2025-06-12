const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const { Email } = require('../models/Email');
const EmailClick = require('../models/EmailClick');
const { sendHTMLEmail } = require('../services/emailService');
const { sequelize } = require('../config/database');

// Obtener todas las campañas
router.get('/', async (req, res) => {
    try {
        const campaigns = await Campaign.findAll({
            order: [['createdAt', 'DESC']]
        });

        const campaignsWithStats = await Promise.all(campaigns.map(async (campaign) => {
            const totalEmails = await Email.count({ where: { campaignId: campaign.id } });
            const sentEmails = await Email.count({ where: { campaignId: campaign.id, status: 'sent' } });
            const openedEmails = await Email.count({ where: { campaignId: campaign.id, trackingOpened: true } });
            const failedEmails = await Email.count({ where: { campaignId: campaign.id, status: 'failed' } });
            
            const clickedEmails = await EmailClick.count({
                include: [{
                    model: Email,
                    where: { campaignId: campaign.id },
                    attributes: []
                }]
            });

            return {
                ...campaign.toJSON(),
                totalEmails,
                sentEmails,
                openedEmails,
                clickedEmails,
                failedEmails
            };
        }));

        res.render('campaigns', { campaigns: campaignsWithStats });
    } catch (error) {
        console.error('Error al obtener campañas y estadísticas:', error);
        res.status(500).json({ error: 'Error al obtener campañas y estadísticas' });
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

// Eliminar una campaña y sus correos asociados
router.delete('/:campaignId', async (req, res) => {
    try {
        const campaignId = req.params.campaignId;

        // Eliminar todos los correos asociados a la campaña
        await Email.destroy({
            where: { campaignId: campaignId }
        });

        // Eliminar la campaña
        const deleted = await Campaign.destroy({
            where: { id: campaignId }
        });

        if (deleted) {
            res.json({ message: 'Campaña y correos asociados eliminados exitosamente' });
        } else {
            res.status(404).json({ error: 'Campaña no encontrada' });
        }
    } catch (error) {
        console.error('Error al eliminar la campaña:', error);
        res.status(500).json({ error: 'Error al eliminar la campaña' });
    }
});

// Programar una campaña
router.post('/:campaignId/schedule', async (req, res) => {
    try {
        const { scheduledFor } = req.body;
        const campaign = await Campaign.findByPk(req.params.campaignId);
        
        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaña no encontrada' });
        }

        // Actualizar la fecha programada de la campaña
        await campaign.update({ scheduledFor });

        // Actualizar la fecha programada de todos los correos pendientes de la campaña
        await Email.update(
            { 
                scheduledFor,
                status: 'scheduled'
            },
            { 
                where: { 
                    campaignId: campaign.id,
                    status: 'pending'
                }
            }
        );

        res.json({ success: true, message: 'Campaña programada exitosamente' });
    } catch (error) {
        console.error('Error al programar la campaña:', error);
        res.status(500).json({ success: false, message: 'Error al programar la campaña' });
    }
});

// Enviar campaña manualmente
router.post('/:campaignId/send-now', async (req, res) => {
    try {
        const campaign = await Campaign.findByPk(req.params.campaignId);
        
        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaña no encontrada' });
        }

        // Obtener todos los correos pendientes de la campaña
        const pendingEmails = await Email.findAll({
            where: {
                campaignId: campaign.id,
                status: ['pending', 'scheduled']
            }
        });

        const results = [];
        const errors = [];

        // Enviar cada correo
        for (const email of pendingEmails) {
            try {
                await sendHTMLEmail(email.toJSON());
                results.push({ email: email.to, status: 'success' });
            } catch (error) {
                console.error(`Error sending email to ${email.to}:`, error);
                errors.push({ email: email.to, error: error.message });
            }
        }

        // Actualizar el estado de la campaña
        await campaign.update({ scheduledFor: null });

        res.json({
            success: true,
            message: `Enviados: ${results.length}, Fallidos: ${errors.length}`,
            results,
            errors
        });
    } catch (error) {
        console.error('Error al enviar la campaña:', error);
        res.status(500).json({ success: false, message: 'Error al enviar la campaña' });
    }
});

module.exports = router; 