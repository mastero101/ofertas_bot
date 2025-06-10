const ejs = require('ejs');
const path = require('path');
const { Email } = require('../models/Email');

const ZEPTO_API_KEY = process.env.ZEPTO_API_KEY;
const ZEPTO_FROM_EMAIL = process.env.ZEPTO_FROM_EMAIL;

async function sendHTMLEmail(emailData) {
    try {
        const fetch = (await import('node-fetch')).default;
        
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
                trackingPixel: `${process.env.BASE_URL}/track/open/${emailData.id}`,
                trackingLink: (link) => `${process.env.BASE_URL}/track/click/${emailData.id}?link=${encodeURIComponent(link)}`
            }
        );

        const response = await fetch('https://api.zeptomail.com/v1.1/email', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `${ZEPTO_API_KEY}`
            },
            body: JSON.stringify({
                from: {
                    address: ZEPTO_FROM_EMAIL
                },
                to: [{
                    email_address: {
                        address: emailData.to,
                        name: emailData.customerName
                    }
                }],
                subject: emailData.subject,
                htmlbody: htmlContent
            })
        });

        const responseData = await response.json();
        console.log('ZeptoMail API Response:', responseData);

        // Guardar el request_id en la base de datos
        if (responseData.request_id) {
            await Email.update(
                { zeptoRequestId: responseData.request_id },
                { where: { id: emailData.id } }
            );
        }

        return responseData;
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
}

module.exports = { sendHTMLEmail }; 