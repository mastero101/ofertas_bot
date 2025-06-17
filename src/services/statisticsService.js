const { Email, EmailClick, Campaign } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('sequelize');

class StatisticsService {
    // Obtener estadísticas diarias
    static async getDailyStats(days = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const dailyStats = await Email.findAll({
            attributes: [
                [sequelize.fn('date', sequelize.col('createdAt')), 'date'],
                [sequelize.fn('count', sequelize.col('id')), 'total'],
                [sequelize.fn('sum', sequelize.literal('CASE WHEN status = \'sent\' THEN 1 ELSE 0 END')), 'sent'],
                [sequelize.fn('sum', sequelize.literal('CASE WHEN "trackingOpened" = true THEN 1 ELSE 0 END')), 'opened'],
                [sequelize.fn('sum', sequelize.literal('CASE WHEN status = \'failed\' THEN 1 ELSE 0 END')), 'failed']
            ],
            where: {
                createdAt: {
                    [Op.gte]: startDate
                }
            },
            group: [sequelize.fn('date', sequelize.col('createdAt'))],
            order: [[sequelize.fn('date', sequelize.col('createdAt')), 'ASC']]
        });

        // Obtener clics por día
        let dailyClicks = [];
        try {
            dailyClicks = await EmailClick.findAll({
                attributes: [
                    [sequelize.fn('date', sequelize.col('clickedAt')), 'date'],
                    [sequelize.fn('count', sequelize.col('id')), 'clicks']
                ],
                where: {
                    clickedAt: {
                        [Op.gte]: startDate
                    }
                },
                group: [sequelize.fn('date', sequelize.col('clickedAt'))],
                order: [[sequelize.fn('date', sequelize.col('clickedAt')), 'ASC']]
            });
        } catch (error) {
            console.log('Error al obtener clics (tabla EmailClicks puede no existir):', error.message);
            dailyClicks = [];
        }

        // Combinar estadísticas de correos y clics
        const combinedStats = {};
        dailyStats.forEach(stat => {
            const date = stat.get('date');
            combinedStats[date] = { ...stat.toJSON(), clicks: 0 };
        });

        dailyClicks.forEach(clickStat => {
            const date = clickStat.get('date');
            if (combinedStats[date]) {
                combinedStats[date].clicks = clickStat.get('clicks');
            } else {
                combinedStats[date] = { date, total: 0, sent: 0, opened: 0, failed: 0, clicks: clickStat.get('clicks') };
            }
        });

        // Asegurar que todos los días en el rango tengan datos (0 si no hay actividad)
        const result = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            result.push(combinedStats[dateStr] || { date: dateStr, total: 0, sent: 0, opened: 0, failed: 0, clicks: 0 });
        }

        return result;
    }

    // Obtener estadísticas de campaña
    static async getCampaignStats(campaignId) {
        const campaign = await Campaign.findByPk(campaignId, {
            include: [{
                model: Email,
                attributes: [
                    'status',
                    [sequelize.fn('count', sequelize.col('id')), 'count']
                ],
                group: ['status']
            }]
        });

        if (!campaign) {
            throw new Error('Campaña no encontrada');
        }

        return campaign;
    }

    // Obtener correos programados
    static async getScheduledEmails() {
        const scheduledEmails = await Email.findAll({
            where: {
                status: 'scheduled',
                scheduledFor: {
                    [Op.gte]: new Date()
                }
            },
            order: [['scheduledFor', 'ASC']]
        });

        return scheduledEmails;
    }

    // Actualizar correo programado
    static async updateScheduledEmail(emailId, updateData) {
        const email = await Email.findByPk(emailId);
        
        if (!email) {
            throw new Error('Correo no encontrado');
        }

        if (email.status !== 'scheduled') {
            throw new Error('Solo se pueden editar correos programados');
        }

        await email.update(updateData);
        return email;
    }

    // Cancelar correo programado
    static async cancelScheduledEmail(emailId) {
        const email = await Email.findByPk(emailId);
        
        if (!email) {
            throw new Error('Correo no encontrado');
        }

        if (email.status !== 'scheduled') {
            throw new Error('Solo se pueden cancelar correos programados');
        }

        await email.update({ status: 'cancelled' });
        return { message: 'Correo cancelado exitosamente' };
    }

    // Obtener estadísticas generales
    static async getGeneralStats() {
        const stats = await Email.findAll({
            attributes: [
                [sequelize.fn('count', sequelize.col('id')), 'total'],
                [sequelize.fn('sum', sequelize.literal('CASE WHEN status = \'sent\' THEN 1 ELSE 0 END')), 'sent'],
                [sequelize.fn('sum', sequelize.literal('CASE WHEN "trackingOpened" = true THEN 1 ELSE 0 END')), 'opened'],
                [sequelize.fn('sum', sequelize.literal('CASE WHEN status = \'failed\' THEN 1 ELSE 0 END')), 'failed']
            ]
        });

        return stats[0];
    }

    // Obtener estadísticas diarias por rango de fechas
    static async getDailyStatsByDateRange(startDate, endDate) {
        const start = startDate ? new Date(startDate) : new Date();
        const end = endDate ? new Date(endDate) : new Date();
        
        // Ajustar las fechas para incluir todo el día
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        const dailyStats = await Email.findAll({
            attributes: [
                [sequelize.fn('date', sequelize.col('createdAt')), 'date'],
                [sequelize.fn('count', sequelize.col('id')), 'total'],
                [sequelize.fn('sum', sequelize.literal('CASE WHEN status = \'sent\' THEN 1 ELSE 0 END')), 'sent'],
                [sequelize.fn('sum', sequelize.literal('CASE WHEN "trackingOpened" = true THEN 1 ELSE 0 END')), 'opened'],
                [sequelize.fn('sum', sequelize.literal('CASE WHEN status = \'failed\' THEN 1 ELSE 0 END')), 'failed']
            ],
            where: {
                createdAt: {
                    [Op.between]: [start, end]
                }
            },
            group: [sequelize.fn('date', sequelize.col('createdAt'))],
            order: [[sequelize.fn('date', sequelize.col('createdAt')), 'ASC']]
        });

        // Obtener clics por día en el rango
        let dailyClicks = [];
        try {
            dailyClicks = await EmailClick.findAll({
                attributes: [
                    [sequelize.fn('date', sequelize.col('clickedAt')), 'date'],
                    [sequelize.fn('count', sequelize.col('id')), 'clicks']
                ],
                where: {
                    clickedAt: {
                        [Op.between]: [start, end]
                    }
                },
                group: [sequelize.fn('date', sequelize.col('clickedAt'))],
                order: [[sequelize.fn('date', sequelize.col('clickedAt')), 'ASC']]
            });
        } catch (error) {
            console.log('Error al obtener clics por rango (tabla EmailClicks puede no existir):', error.message);
            dailyClicks = [];
        }

        // Combinar estadísticas de correos y clics
        const combinedStats = {};
        dailyStats.forEach(stat => {
            const date = stat.get('date');
            combinedStats[date] = { ...stat.toJSON(), clicks: 0 };
        });

        dailyClicks.forEach(clickStat => {
            const date = clickStat.get('date');
            if (combinedStats[date]) {
                combinedStats[date].clicks = clickStat.get('clicks');
            } else {
                combinedStats[date] = { date, total: 0, sent: 0, opened: 0, failed: 0, clicks: clickStat.get('clicks') };
            }
        });

        // Asegurar que todos los días en el rango tengan datos (0 si no hay actividad)
        const result = [];
        const currentDate = new Date(start);
        
        while (currentDate <= end) {
            const dateStr = currentDate.toISOString().split('T')[0];
            result.push(combinedStats[dateStr] || { 
                date: dateStr, 
                total: 0, 
                sent: 0, 
                opened: 0, 
                failed: 0, 
                clicks: 0 
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return result;
    }

    // Obtener correos por estado
    static async getEmailsByStatus(status, limit = 50) {
        const whereClause = {};
        
        if (status && status !== 'all') {
            whereClause.status = status;
        }

        const emails = await Email.findAll({
            where: whereClause,
            order: [['createdAt', 'DESC']],
            limit: limit,
            attributes: [
                'id', 'to', 'subject', 'status', 'createdAt', 'sentAt', 
                'scheduledFor', 'customerName', 'offerTitle', 'trackingOpened'
            ]
        });

        return emails;
    }

    // Obtener estadísticas por estado
    static async getStatsByStatus() {
        const stats = await Email.findAll({
            attributes: [
                'status',
                [sequelize.fn('count', sequelize.col('id')), 'count']
            ],
            group: ['status']
        });

        return stats;
    }

    // Obtener detalles completos de un correo
    static async getEmailDetails(emailId) {
        const email = await Email.findByPk(emailId, {
            include: [{
                model: Campaign,
                attributes: ['name', 'description']
            }]
        });

        if (!email) {
            throw new Error('Correo no encontrado');
        }

        return email;
    }

    // Renderizar el HTML del correo
    static async renderEmailHTML(emailId) {
        const email = await this.getEmailDetails(emailId);
        
        // Importar las funciones necesarias
        const ejs = require('ejs');
        const path = require('path');
        const EmailTrackingService = require('./emailTracking');

        // Preparar los datos para la plantilla
        const templateData = {
            customerName: email.customerName,
            offerTitle: email.offerTitle,
            offerDescription: email.offerDescription,
            offerPrice: email.offerPrice,
            offerLink: email.offerLink || '#',
            productImage: email.productImage,
            companyName: email.Campaign?.name || 'HAMSE',
            unsubscribeLink: '#',
            trackingLink: (link) => EmailTrackingService.generateTrackingLink(emailId, link),
            trackingPixel: EmailTrackingService.generateTrackingLink(emailId)
        };

        // Renderizar la plantilla
        return new Promise((resolve, reject) => {
            ejs.renderFile(path.join(__dirname, '..', '..', 'views', 'email-template.ejs'), templateData, (err, html) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(html);
                }
            });
        });
    }
}

module.exports = StatisticsService; 