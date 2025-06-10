const { Email, EmailClick } = require('../models/Email');
const Campaign = require('../models/Campaign');
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
        const dailyClicks = await EmailClick.findAll({
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
}

module.exports = StatisticsService; 