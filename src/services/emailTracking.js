const { Email, EmailClick } = require('../models/Email');
const { Op } = require('sequelize');
const sequelize = require('sequelize');

class EmailTrackingService {
    static async trackOpen(emailId) {
        try {
            const email = await Email.findByPk(emailId);
            if (!email) return false;

            email.trackingOpened = true;
            email.trackingOpenedAt = new Date();
            await email.save();
            return true;
        } catch (error) {
            console.error('Error tracking email open:', error);
            return false;
        }
    }

    static async trackClick(emailId, link) {
        try {
            await EmailClick.create({
                emailId,
                link,
                clickedAt: new Date()
            });
            return true;
        } catch (error) {
            console.error('Error tracking email click:', error);
            return false;
        }
    }

    static async getEmailStats(campaignId = null) {
        try {
            const whereClause = campaignId ? { campaignId } : {};

            const total = await Email.count({ where: whereClause });
            const opened = await Email.count({ where: { ...whereClause, trackingOpened: true } });
            const clicks = await EmailClick.count({
                include: [{
                    model: Email,
                    where: whereClause,
                    attributes: []
                }]
            });

            return {
                total,
                opened,
                clicks
            };
        } catch (error) {
            console.error('Error getting email stats:', error);
            return { total: 0, opened: 0, clicks: 0 };
        }
    }

    static async getActivityData() {
        try {
            const last7Days = new Date();
            last7Days.setDate(last7Days.getDate() - 7);

            const emails = await Email.findAll({
                where: {
                    createdAt: {
                        [Op.gte]: last7Days
                    }
                },
                order: [['createdAt', 'ASC']]
            });

            // Inicializar datos para los últimos 7 días
            const dates = [];
            const opens = [];
            const clicks = [];

            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                dates.push(dateStr);

                const dayOpens = emails.filter(email => 
                    email.trackingOpenedAt && 
                    email.trackingOpenedAt.toISOString().split('T')[0] === dateStr
                ).length;

                const dayClicks = emails.filter(email => 
                    email.clickedAt && 
                    email.clickedAt.toISOString().split('T')[0] === dateStr
                ).length;

                opens.push(dayOpens);
                clicks.push(dayClicks);
            }

            return {
                dates,
                opens,
                clicks
            };
        } catch (error) {
            console.error('Error getting activity data:', error);
            throw error;
        }
    }

    static async generateTrackingLink(emailId, link = null) {
        try {
            const baseUrl = process.env.BASE_URL || 'http://localhost:1071'; // Usar BASE_URL
            if (link) {
                // Generar enlace de seguimiento de clic
                // Codificar el enlace original para que no cause problemas en la URL
                const encodedLink = encodeURIComponent(link);
                return `${baseUrl}/track/click/${emailId}?link=${encodedLink}`;
            } else {
                // Generar URL del pixel de seguimiento de apertura
                return `${baseUrl}/track/open/${emailId}`;
            }
        } catch (error) {
            console.error('Error generating tracking link:', error);
            // Retornar el enlace original o una cadena vacía en caso de error
            return link || '';
        }
    }
}

module.exports = EmailTrackingService; 