const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const ejs = require('ejs');
const imgbbUploader = require('imgbb-uploader');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

let fetch;
(async () => {
    fetch = (await import('node-fetch')).default;
})();

const app = express();
const port = 1071;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

// Update the upload route to process Excel files
app.post('/upload', upload.single('excelFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        // Read Excel file from buffer
        const workbook = xlsx.read(req.file.buffer);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        // Validate data structure
        if (data.length === 0) {
            return res.status(400).json({ success: false, message: 'Excel file is empty' });
        }

        // Process each row
        for (const row of data) {
            const emailData = {
                to: row.email,
                subject: row.subject,
                companyName: 'HAMSE',
                customerName: row.customerName || 'Cliente',
                offerTitle: row.offerTitle,
                offerDescription: row.offerDescription,
                offerPrice: row.offerPrice,
                offerLink: row.offerLink || '#',
                unsubscribeLink: '#',
                productImage: row.productImage || null
            };

            try {
                await sendHTMLEmail(emailData);
                console.log(`Email sent successfully to ${row.email}`);
            } catch (error) {
                console.error(`Failed to send email to ${row.email}:`, error);
            }
        }

        res.json({ 
            success: true, 
            message: `Processed ${data.length} emails successfully`,
            totalEmails: data.length
        });
    } catch (error) {
        console.error('Error processing Excel file:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error processing Excel file',
            error: error.message 
        });
    }
});

//function to send HTML email
// Replace the constants with environment variables
const ZEPTO_API_KEY = process.env.ZEPTO_API_KEY;
const ZEPTO_FROM_EMAIL = process.env.ZEPTO_FROM_EMAIL;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

// Update the sendHTMLEmail function with better error handling
async function sendHTMLEmail(emailData) {
    try {
        const htmlContent = await ejs.renderFile(
            path.join(__dirname, '../views/email-template.ejs'),
            {
                companyName: emailData.companyName,
                customerName: emailData.customerName,
                offerTitle: emailData.offerTitle,
                offerDescription: emailData.offerDescription,
                offerPrice: emailData.offerPrice,
                offerLink: emailData.offerLink,
                unsubscribeLink: emailData.unsubscribeLink,
                productImage: emailData.productImage
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

        const responseData = await response.text();
        console.log('ZeptoMail API Response:', responseData);

        if (!response.ok) {
            throw new Error(`Email sending failed: ${response.status} - ${response.statusText} - ${responseData}`);
        }

        return JSON.parse(responseData);
    } catch (error) {
        console.error('Detailed error:', error);
        throw error;
    }
}

// Update the send-emails route with better error handling
app.post('/send-emails', upload.single('productImage'), async (req, res) => {
    try {
        let imageUrl = null;
        if (req.file) {
            const imgbbResponse = await imgbbUploader({
                apiKey: IMGBB_API_KEY,
                base64string: req.file.buffer.toString('base64')
            });
            imageUrl = imgbbResponse.display_url;
        }

        const emailData = {
            to: req.body.email,
            subject: req.body.subject,
            companyName: 'HAMSE',
            customerName: req.body.customerName || 'Cliente',
            offerTitle: req.body.offerTitle,
            offerDescription: req.body.offerDescription,
            offerPrice: req.body.offerPrice,
            offerLink: req.body.offerLink || '#',
            unsubscribeLink: '#',
            productImage: imageUrl // Use the ImgBB URL instead of local path
        };

        const result = await sendHTMLEmail(emailData);
        res.json({ success: true, message: 'Email sent successfully', result });
    } catch (error) {
        console.error('Error sending email:', error);
        
        // Handle specific ZeptoMail errors
        if (error.message.includes('IP address not allowed')) {
            return res.status(403).json({ 
                success: false, 
                message: 'Server IP not authorized. Please contact administrator.',
                error: 'IP_NOT_WHITELISTED'
            });
        }
        
        res.status(500).json({ 
            success: false, 
            message: 'Error sending email. Please try again later.',
            error: error.message
        });
    }
});

// Add this near the top with other middleware
app.use('/uploads', express.static('uploads'));

// Update the preview route to handle file uploads
app.post('/preview-email', upload.single('productImage'), async (req, res) => {
    try {
        let imageUrl = null;
        if (req.file) {
            const imgbbResponse = await imgbbUploader({
                apiKey: IMGBB_API_KEY,
                base64string: req.file.buffer.toString('base64')
            });
            imageUrl = imgbbResponse.display_url;
        }

        const emailData = {
            to: req.body.email || 'preview@example.com',
            subject: req.body.subject || 'Vista Previa',
            companyName: 'HAMSE',
            customerName: req.body.customerName || 'Cliente',
            offerTitle: req.body.offerTitle || '',
            offerDescription: req.body.offerDescription || '',
            offerPrice: req.body.offerPrice || '',
            offerLink: req.body.offerLink || '#',
            unsubscribeLink: '#',
            productImage: imageUrl  // Use ImgBB URL instead of local path
        };

        const htmlContent = await ejs.renderFile(
            path.join(__dirname, '../views/email-template.ejs'),
            emailData
        );

        res.send(htmlContent);
    } catch (error) {
        console.error('Error generating preview:', error);
        res.status(500).send('Error al generar la vista previa');
    }
});

// Route to download the template
app.get('/download-template', (req, res) => {
    // Create a new workbook
    const workbook = xlsx.utils.book_new();
    
    // Sample data with headers
    const data = [{
        email: 'ejemplo@correo.com',
        subject: 'Oferta Especial',
        customerName: 'Nombre Cliente',
        offerTitle: 'Título de la Oferta',
        offerDescription: 'Descripción detallada de la oferta',
        offerPrice: '99.99',
        offerLink: 'https://ejemplo.com/oferta',
        productImage: 'https://ejemplo.com/imagen.jpg'
    }];

    // Create worksheet with sample data
    const worksheet = xlsx.utils.json_to_sheet(data);

    // Add some styling to headers
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    for (let C = range.s.c; C <= range.e.c; ++C) {
        const address = xlsx.utils.encode_col(C) + "1";
        if (!worksheet[address]) continue;
        worksheet[address].s = {
            font: { bold: true },
            fill: { fgColor: { rgb: "CCCCCC" } }
        };
    }

    // Add the worksheet to workbook
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Correos');

    // Generate buffer
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for download
    res.setHeader('Content-Disposition', 'attachment; filename=plantilla_correos.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    res.send(buffer);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});