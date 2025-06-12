const ejs = require('ejs');
const path = require('path');
const { Email } = require('../models/Email');
const axios = require('axios');

const ZEPTO_API_KEY = process.env.ZEPTO_API_KEY;
const ZEPTO_FROM_EMAIL = process.env.ZEPTO_FROM_EMAIL;

async function sendHTMLEmail(emailData) {
    try {
        console.log('=== INICIO DE sendHTMLEmail ===');
        
        // Validar variables de entorno requeridas
        const requiredEnvVars = {
            ZEPTO_API_KEY: process.env.ZEPTO_API_KEY,
            BOUNCE_EMAIL: process.env.BOUNCE_EMAIL,
            FROM_EMAIL: process.env.FROM_EMAIL,
            BASE_URL: process.env.BASE_URL
        };

        const missingVars = Object.entries(requiredEnvVars)
            .filter(([_, value]) => !value)
            .map(([key]) => key);

        if (missingVars.length > 0) {
            throw new Error(`Faltan variables de entorno requeridas: ${missingVars.join(', ')}`);
        }

        // Si el correo está programado
        if (emailData.scheduledFor) {
            console.log('Correo programado detectado. Fecha programada:', emailData.scheduledFor);
            await Email.update(
                {
                    status: 'scheduled',
                    scheduledFor: emailData.scheduledFor
                },
                { where: { id: emailData.id } }
            );
            return { message: 'Email scheduled successfully', emailId: emailData.id, status: 'scheduled' };
        }

        // Preparar el HTML del correo
        const htmlContent = await generateEmailHTML({
            ...emailData,
            baseUrl: process.env.BASE_URL
        });

        // Configuración para ZeptoMail
        const emailPayload = {
            bounce_address: process.env.BOUNCE_EMAIL,
            from: {
                address: process.env.FROM_EMAIL,
                name: emailData.companyName || 'HAMSE'
            },
            to: [{
                email_address: {
                    address: emailData.to,
                    name: emailData.customerName || 'Cliente'
                }
            }],
            subject: emailData.subject,
            textbody: emailData.offerDescription || '',
            htmlbody: htmlContent
        };

        console.log('Payload del correo:', JSON.stringify(emailPayload, null, 2));

        const config = {
            method: 'post',
            url: 'https://api.zeptomail.com/v1.1/email',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Zoho-enczapikey ${process.env.ZEPTO_API_KEY}`
            },
            data: emailPayload
        };

        console.log('Enviando solicitud a ZeptoMail...');
        const response = await axios(config);
        const responseData = response.data;

        console.log('Respuesta de ZeptoMail:', responseData);

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
        console.error('=== ERROR EN sendHTMLEmail ===');
        console.error('Detalles del error:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            config: {
                url: error.config?.url,
                method: error.config?.method,
                headers: {
                    ...error.config?.headers,
                    'Authorization': 'Zoho-enczapikey [OCULTO]'
                },
                data: error.config?.data
            }
        });

        if (emailData.id) {
            await Email.update(
                { status: 'failed' },
                { where: { id: emailData.id } }
            );
        }

        throw error;
    }
}

async function generateEmailHTML(emailData) { // Make this async
    console.log('generateEmailHTML: Generating HTML for email:', emailData.id);
    const htmlContent = await ejs.renderFile( // AWAIT here
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