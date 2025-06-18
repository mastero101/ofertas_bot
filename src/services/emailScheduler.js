const cron = require('node-cron');
const { Email } = require('../models');
const { Op } = require('sequelize');
const { sendHTMLEmail } = require('./emailService');

class EmailScheduler {
    static init() {
        // Ejecutar cada minuto para verificar correos programados
        cron.schedule('* * * * *', async () => {
            try {
                console.log('[CRON] Buscando correos programados para enviar...');
                const scheduledEmails = await Email.findAll({
                    where: {
                        status: 'scheduled',
                        scheduledFor: {
                            [Op.lte]: new Date()
                        }
                    }
                });

                console.log(`[CRON] Correos programados encontrados: ${scheduledEmails.length}`);

                for (const email of scheduledEmails) {
                    try {
                        console.log(`[CRON] Intentando enviar correo programado ID: ${email.id}, para: ${email.to}, programado para: ${email.scheduledFor}`);
                        await sendHTMLEmail({
                            id: email.id,
                            to: email.to,
                            subject: email.subject,
                            customerName: email.customerName,
                            offerTitle: email.offerTitle,
                            offerDescription: email.offerDescription,
                            offerPrice: email.offerPrice,
                            offerLink: email.offerLink,
                            productImage: email.productImage
                        });
                        console.log(`[CRON] Correo enviado correctamente. ID: ${email.id}`);
                        await email.update({
                            status: 'sent',
                            sentAt: new Date()
                        });
                    } catch (error) {
                        console.error(`[CRON] Error enviando correo programado ${email.id}:`, error);
                        await email.update({ status: 'failed' });
                    }
                }
            } catch (error) {
                console.error('[CRON] Error en el programador de correos:', error);
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