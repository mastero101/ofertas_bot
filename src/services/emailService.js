const ejs = require('ejs');
const path = require('path');
const { Email } = require('../models');
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

        // Preparar el payload del correo
        const emailPayload = {
            from: {
                address: "noreply@ferche.app",
                name: emailData.customerName || "HAMSE"
            },
            to: [{
                email_address: {
                    address: emailData.to,
                    name: emailData.customerName
                }
            }],
            subject: emailData.subject,
            textbody: emailData.offerDescription,
            htmlbody: htmlContent,
            track_clicks: true,
            track_opens: true
        };

        // Log del payload (sin el HTML por brevedad)
        console.log('Payload del correo:', {
            ...emailPayload,
            htmlbody: '[OMITIDO POR LONGITUD]'
        });

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

        // Configuración de Axios con mejor manejo de errores
        console.log('Enviando solicitud a ZeptoMail con payload:', JSON.stringify({
            ...emailPayload,
            htmlbody: emailPayload.htmlbody ? '[OMITIDO POR LONGITUD]' : undefined
        }, null, 2));

        try {
            const response = await axios({
                method: 'post',
                url: 'https://api.zeptomail.com/v1.1/email',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': process.env.ZEPTO_API_KEY,
                    'User-Agent': 'Node.js/1.0'
                },
                data: emailPayload,
                timeout: 30000,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                validateStatus: null // Permitir cualquier código de estado para ver el error completo
            });

            console.log('Respuesta completa de ZeptoMail:', {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                data: response.data
            });

            // Verificar si la respuesta es exitosa
            if (response.data && response.data.data && Array.isArray(response.data.data)) {
                const successResponse = response.data.data.find(item => item.code === 'EM_104');
                if (successResponse) {
                    await Email.update(
                        {
                            status: 'sent',
                            sentAt: new Date(),
                            zeptoRequestId: response.data.request_id || null
                        },
                        { where: { id: emailData.id } }
                    );
                    return response.data;
                }
            }

            throw new Error(`Respuesta inesperada de ZeptoMail: ${JSON.stringify(response.data, null, 2)}`);
        } catch (error) {
            console.error('=== ERROR DETALLADO EN sendHTMLEmail ===');
            
            // Log del error completo
            if (error.response) {
                console.error('Respuesta de error:', {
                    status: error.response.status,
                    statusText: error.response.statusText,
                    headers: error.response.headers,
                    data: error.response.data
                });
            }

            // Log del error de red
            if (error.request) {
                console.error('Error de red:', {
                    method: error.request.method,
                    path: error.request.path,
                    headers: error.request.getHeaders?.()
                });
            }

            // Log del mensaje de error
            console.error('Mensaje de error:', error.message);

            // Log del stack trace
            console.error('Stack trace:', error.stack);

            // Intentar obtener más detalles del error
            let errorDetails = error.message;
            try {
                if (error.response?.data) {
                    const errorData = typeof error.response.data === 'string' 
                        ? JSON.parse(error.response.data) 
                        : error.response.data;
                    errorDetails = JSON.stringify(errorData, null, 2);
                }
            } catch (e) {
                console.error('Error al parsear detalles adicionales:', e);
            }

            // Actualizar el estado del correo con los detalles del error
            await Email.update(
                {
                    status: 'failed',
                    errorDetails: errorDetails
                },
                { where: { id: emailData.id } }
            );

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
                    'Authorization': '[OCULTO]'
                }
            }
        });

        // Intentar obtener más detalles del error
        let errorDetails = error.message;
        try {
            if (error.response?.data) {
                const errorData = typeof error.response.data === 'string' 
                    ? JSON.parse(error.response.data) 
                    : error.response.data;
                errorDetails = JSON.stringify(errorData);
            }
        } catch (e) {
            console.error('Error al parsear detalles adicionales:', e);
        }

        // Actualizar el estado del correo con los detalles del error
        await Email.update(
            {
                status: 'failed',
                errorDetails: errorDetails
            },
            { where: { id: emailData.id } }
        );

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