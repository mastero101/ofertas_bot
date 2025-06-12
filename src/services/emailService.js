const ejs = require('ejs');
const path = require('path');
const { Email } = require('../models/Email');
const axios = require('axios');

const ZEPTO_API_KEY = process.env.ZEPTO_API_KEY;
const ZEPTO_FROM_EMAIL = process.env.ZEPTO_FROM_EMAIL;

async function sendHTMLEmail(emailData) {
    try {
        console.log('=== INICIO DE sendHTMLEmail ===');
        console.log('Datos del correo recibidos:', {
            id: emailData.id,
            to: emailData.to,
            subject: emailData.subject,
            scheduledFor: emailData.scheduledFor
        });

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
            console.log('Estado del correo actualizado a "scheduled"');
            return { message: 'Email scheduled successfully', emailId: emailData.id, status: 'scheduled' };
        }

        console.log('Preparando envío inmediato del correo...');

        // Verificar variables de entorno
        console.log('Verificando variables de entorno:');
        console.log('ZEPTO_API_KEY existe:', !!process.env.ZEPTO_API_KEY);
        console.log('BOUNCE_EMAIL existe:', !!process.env.BOUNCE_EMAIL);
        console.log('FROM_EMAIL existe:', !!process.env.FROM_EMAIL);

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
                htmlbody: await generateEmailHTML(emailData)
            }
        };

        console.log('Configuración de la solicitud preparada:', {
            url: config.url,
            method: config.method,
            headers: {
                ...config.headers,
                'Authorization': 'Zoho-enczapikey [OCULTO]' // Ocultamos la API key por seguridad
            }
        });

        console.log('Datos del correo a enviar:', {
            to: config.data.to,
            subject: config.data.subject,
            from: config.data.from,
            htmlbody_length: config.data.htmlbody?.length || 0
        });

        console.log('Enviando solicitud a ZeptoMail...');
        const response = await axios(config);
        const responseData = response.data;

        console.log('Respuesta de ZeptoMail recibida:', responseData);

        if (responseData.request_id) {
            console.log('Actualizando estado del correo con request_id:', responseData.request_id);
            await Email.update(
                {
                    zeptoRequestId: responseData.request_id,
                    status: 'sent',
                    sentAt: new Date()
                },
                { where: { id: emailData.id } }
            );
            console.log('Estado del correo actualizado a "sent"');
        }

        console.log('=== FIN DE sendHTMLEmail - ÉXITO ===');
        return responseData;
    } catch (error) {
        console.error('=== ERROR EN sendHTMLEmail ===');
        console.error('Detalles del error:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data
        });

        if (emailData.id) {
            console.log('Actualizando estado del correo a "failed"');
            await Email.update(
                { status: 'failed' },
                { where: { id: emailData.id } }
            );
        }

        console.error('=== FIN DE sendHTMLEmail - ERROR ===');
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