const ejs = require('ejs');
const path = require('path');
const { Email } = require('../models/Email');
const axios = require('axios');

const ZEPTO_API_KEY = process.env.ZEPTO_API_KEY;
const ZEPTO_FROM_EMAIL = process.env.ZEPTO_FROM_EMAIL;

async function sendHTMLEmail(emailData) {
    try {
        console.log('sendHTMLEmail received emailData:', emailData);
        console.log('emailData.scheduledFor:', emailData.scheduledFor);
        // Si el correo está programado, solo actualizar el estado
        if (emailData.scheduledFor) {
            await Email.update(
                { 
                    status: 'scheduled',
                    scheduledFor: emailData.scheduledFor
                },
                { where: { id: emailData.id } }
            );
            return { message: 'Email scheduled successfully' };
        }

        // Configuración para ZeptoMail
        const config = {
            method: 'post',
            url: 'https://api.zeptomail.com/v1.1/email',
            headers: {
                'Authorization': `Zoho-enczapikey ${process.env.ZEPTO_API_KEY}`,
                'Content-Type': 'application/json'
            },
            data: {
                bounce_address: process.env.BOUNCE_EMAIL,
                from: {
                    address: process.env.FROM_EMAIL,
                    name: emailData.companyName || 'HAMSE'
                },
                to: [{
                    email_address: {
                        address: emailData.to,
                        name: emailData.customerName
                    }
                }],
                subject: emailData.subject,
                textbody: emailData.offerDescription,
                htmlbody: generateEmailHTML(emailData)
            }
        };

        const response = await axios(config);
        const responseData = response.data;

        console.log('ZeptoMail API Response:', responseData);

        // Guardar el request_id en la base de datos
        if (responseData.request_id) {
            await Email.update(
                { 
                    zeptoRequestId: responseData.request_id,
                    status: 'sent',
                    sentAt: new Date()
                },
                { where: { id: emailData.id } }
            );
        }

        return responseData;
    } catch (error) {
        console.error('Error sending email:', error);
        // Actualizar el estado a 'failed' en caso de error
        if (emailData.id) {
            await Email.update(
                { status: 'failed' },
                { where: { id: emailData.id } }
            );
        }
        throw error;
    }
}

function generateEmailHTML(emailData) {
    const htmlContent = ejs.renderFile(
        path.join(__dirname, '../../views/email-template.ejs'),
        {
            companyName: emailData.companyName || 'HAMSE',
            customerName: emailData.customerName,
            offerTitle: emailData.offerTitle,
            offerDescription: emailData.offerDescription,
            offerPrice: emailData.offerPrice,
            offerLink: emailData.offerLink,
            unsubscribeLink: emailData.unsubscribeLink || '#',
            productImage: emailData.productImage,
            trackingPixel: `${process.env.BASE_URL}/track/open/${emailData.id}`,
            trackingLink: (link) => `${process.env.BASE_URL}/track/click/${emailData.id}?link=${encodeURIComponent(link)}`
        }
    );
    return htmlContent;
}

module.exports = {
    sendHTMLEmail
}; 