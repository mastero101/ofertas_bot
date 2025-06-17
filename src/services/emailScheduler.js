const cron = require('node-cron');
const { Email } = require('../models');
const { Op } = require('sequelize');
const { sendHTMLEmail } = require('./emailService');

class EmailScheduler {
    static init() {
        // Ejecutar cada minuto para verificar correos programados
        cron.schedule('* * * * *', async () => {
            try {
                const scheduledEmails = await Email.findAll({
                    where: {
                        status: 'scheduled',
                        scheduledFor: {
                            [Op.lte]: new Date()
                        }
                    }
                });

                for (const email of scheduledEmails) {
                    try {
                        await sendHTMLEmail({
                            to: email.to,
                            subject: email.subject,
                            customerName: email.customerName,
                            offerTitle: email.offerTitle,
                            offerDescription: email.offerDescription,
                            offerPrice: email.offerPrice,
                            offerLink: email.offerLink,
                            productImage: email.productImage
                        });

                        await email.update({
                            status: 'sent',
                            sentAt: new Date()
                        });
                    } catch (error) {
                        console.error(`Error sending scheduled email ${email.id}:`, error);
                        await email.update({ status: 'failed' });
                    }
                }
            } catch (error) {
                console.error('Error in email scheduler:', error);
            }
        });
    }

    static async scheduleEmail(emailData, scheduledFor) {
        try {
            const email = await Email.create({
                ...emailData,
                status: 'scheduled',
                scheduledFor: new Date(scheduledFor)
            });
            return email;
        } catch (error) {
            console.error('Error scheduling email:', error);
            throw error;
        }
    }

    static async getScheduledEmails() {
        try {
            return await Email.findAll({
                where: { status: 'scheduled' },
                order: [['scheduledFor', 'ASC']]
            });
        } catch (error) {
            console.error('Error getting scheduled emails:', error);
            throw error;
        }
    }

    static async cancelScheduledEmail(emailId) {
        try {
            const email = await Email.findByPk(emailId);
            if (email && email.status === 'scheduled') {
                await email.update({
                    status: 'pending',
                    scheduledFor: null
                });
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error canceling scheduled email:', error);
            throw error;
        }
    }
}

module.exports = EmailScheduler; 