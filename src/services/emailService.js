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
        console.log('sendHTMLEmail: Llamando a generateEmailHTML con emailData:', emailData.id);
        const htmlContent = await generateEmailHTML({
            ...emailData,
            baseUrl: process.env.BASE_URL
        });
        console.log('sendHTMLEmail: HTML Content recibido de generateEmailHTML (primeros 500 caracteres):', htmlContent ? htmlContent.substring(0, 500) : 'HTML vacio');
        console.log('sendHTMLEmail: Longitud total del HTML Content:', htmlContent ? htmlContent.length : 0);

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
            htmlbody: htmlContent,
            track_clicks: true,
            track_opens: true
        };

        console.log('Payload del correo (htmlbody primeros 500 caracteres):', emailPayload.htmlbody ? emailPayload.htmlbody.substring(0, 500) : 'HTML vacio en payload');
        console.log('Payload del correo (longitud total htmlbody):', emailPayload.htmlbody ? emailPayload.htmlbody.length : 0);
        console.log('Payload completo (sin htmlbody, por brevedad):', JSON.stringify({ ...emailPayload, htmlbody: '[OMITIDO POR LONGITUD]' }, null, 2));

        const config = {
            method: 'post',
            url: 'https://api.zeptomail.com/v1.1/email',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Zoho-enczapikey ${process.env.ZEPTO_API_KEY}`,
                'User-Agent': 'Node.js/1.0'
            },
            data: emailPayload,
            timeout: 30000, // Aumentado a 30 segundos
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            validateStatus: function (status) {
                return status >= 200 && status < 500;
            },
            transformResponse: [(data) => {
                try {
                    return JSON.parse(data);
                } catch (e) {
                    return data;
                }
            }]
        };

        console.log('Enviando solicitud a ZeptoMail...');
        console.log('Headers:', {
            ...config.headers,
            'Authorization': 'Zoho-enczapikey [OCULTO]'
        });

        try {
            // Validar el payload antes de enviar
            if (!emailPayload.to || !emailPayload.to.length) {
                throw new Error('No se especificaron destinatarios');
            }

            if (!emailPayload.from || !emailPayload.from.address) {
                throw new Error('No se especificó el remitente');
            }

            if (!emailPayload.subject) {
                throw new Error('No se especificó el asunto');
            }

            const response = await axios(config);
            
            // Verificar si la respuesta es válida
            if (!response.data) {
                throw new Error('Respuesta vacía de ZeptoMail');
            }

            console.log('Respuesta de ZeptoMail:', response.data);

            if (response.data.request_id) {
                await Email.update(
                    {
                        zeptoRequestId: response.data.request_id,
                        status: 'sent',
                        sentAt: new Date()
                    },
                    { where: { id: emailData.id } }
                );
            } else {
                console.warn('ZeptoMail no devolvió un request_id en la respuesta:', response.data);
            }

            return response.data;
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
                    }
                }
            });

            // Log del payload que causó el error
            if (error.config?.data) {
                console.error('Payload que causó el error:', JSON.stringify(error.config.data, null, 2));
            }

            // Intentar obtener más detalles del error
            if (error.response?.data) {
                try {
                    const errorData = typeof error.response.data === 'string' 
                        ? JSON.parse(error.response.data) 
                        : error.response.data;
                    console.error('Detalles adicionales del error:', errorData);
                } catch (e) {
                    console.error('Error al parsear detalles adicionales:', e);
                }
            }

            if (emailData.id) {
                await Email.update(
                    { 
                        status: 'failed',
                        errorDetails: error.message
                    },
                    { where: { id: emailData.id } }
                );
            }

            throw error;
        }
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

        // Log del payload que causó el error
        if (error.config?.data) {
            console.error('Payload que causó el error:', JSON.stringify(error.config.data, null, 2));
        }

        if (emailData.id) {
            await Email.update(
                { status: 'failed' },
                { where: { id: emailData.id } }
            );
        }

        throw error;
    }
}

async function generateEmailHTML(emailData) {
    console.log('generateEmailHTML: Generating HTML for email:', emailData.id);
    console.log('generateEmailHTML: Using baseUrl:', emailData.baseUrl);
    
    const htmlContent = await ejs.renderFile(
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
            trackingPixel: `${emailData.baseUrl}/track/open/${emailData.id}`,
            trackingLink: (link) => `${emailData.baseUrl}/track/click/${emailData.id}?link=${encodeURIComponent(link)}`
        }
    );
    
    console.log('generateEmailHTML: HTML generado (primeros 500 caracteres):', htmlContent ? htmlContent.substring(0, 500) : 'HTML vacio');
    console.log('generateEmailHTML: Longitud total del HTML generado:', htmlContent ? htmlContent.length : 0);
    console.log('generateEmailHTML: HTML generated successfully');
    return htmlContent;
}

module.exports = {
    sendHTMLEmail
}; 