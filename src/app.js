const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const ejs = require('ejs');
const imgbbUploader = require('imgbb-uploader');
const { connectDB } = require('./config/database');
const EmailScheduler = require('./services/emailScheduler');
const EmailTrackingService = require('./services/emailTracking');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

let fetch;
(async () => {
    fetch = (await import('node-fetch')).default;
})();

const app = express();
const port = 1071;

// Conectar a la base de datos
connectDB();

// Iniciar el programador de correos
EmailScheduler.init();

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
    res.redirect('/dashboard');
});

app.get('/enviar', (req, res) => {
    res.render('index');
});

// Update the upload route to process Excel files
// Add this near the top of your file
let emailQueue = [];

// Update the upload route
app.post('/upload', upload.fields([
    { name: 'excelFile', maxCount: 1 },
    { name: 'productImage', maxCount: 1 }
]), async (req, res) => {
    try {
        if (!req.files?.excelFile) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        // Validate required fields
        if (!req.body.subject) {
            return res.status(400).json({ 
                success: false, 
                message: 'Subject is required for the email' 
            });
        }

        // Generar ID de campaña si no se proporciona
        const campaignId = `campaign_${Date.now()}`;

        // Handle product image upload if present
        let imageUrl = null;
        if (req.files?.productImage) {
            const imgbbResponse = await imgbbUploader({
                apiKey: IMGBB_API_KEY,
                base64string: req.files.productImage[0].buffer.toString('base64')
            });
            imageUrl = imgbbResponse.display_url;
        }

        // Read Excel file
        const workbook = xlsx.read(req.files.excelFile[0].buffer);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        if (data.length === 0) {
            return res.status(400).json({ success: false, message: 'Excel file is empty' });
        }

        // Validate email addresses in Excel
        const invalidEmails = data.filter(row => !row.email || !row.email.includes('@'));
        if (invalidEmails.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email addresses found in Excel file',
                invalidEmails
            });
        }

        // Store data in queue with common email content
        emailQueue = data.map(row => ({
            to: row.email,
            customerName: row.customerName || 'Cliente',
            subject: req.body.subject.trim(),  // Ensure subject is trimmed
            companyName: 'HAMSE',
            offerTitle: req.body.offerTitle,
            offerDescription: req.body.offerDescription,
            offerPrice: req.body.offerPrice,
            offerLink: req.body.offerLink || '#',
            unsubscribeLink: '#',
            productImage: imageUrl,
            campaignId: campaignId // Asignar campaignId a cada email en la cola
        }));

        res.json({ 
            success: true, 
            message: `Loaded ${data.length} emails successfully`,
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

// Update the template download route
app.get('/download-template', (req, res) => {
    const workbook = xlsx.utils.book_new();
    
    // Simplified template with only email and optional customer name
    const data = [{
        email: 'ejemplo@correo.com',
        customerName: 'Nombre Cliente (Opcional)'
    }];

    const worksheet = xlsx.utils.json_to_sheet(data);

    // Add styling to headers
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    for (let C = range.s.c; C <= range.e.c; ++C) {
        const address = xlsx.utils.encode_col(C) + "1";
        if (!worksheet[address]) continue;
        worksheet[address].s = {
            font: { bold: true },
            fill: { fgColor: { rgb: "CCCCCC" } }
        };
    }

    xlsx.utils.book_append_sheet(workbook, worksheet, 'Lista de Correos');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename=plantilla_correos.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
});

// Add new routes for queue management
app.get('/queue', (req, res) => {
    res.json(emailQueue);
});

app.post('/send-queue', async (req, res) => {
    try {
        const results = [];
        const errors = [];
        const { Email } = require('./models/Email');

        for (const emailData of emailQueue) {
            try {
                // *** Guardar cada correo en la base de datos antes de enviar ***
                // Asegurarse de que emailData de la cola tenga todos los campos necesarios
                const createdEmail = await Email.create(emailData);
                
                // Usar el objeto de correo creado (con ID) para enviar
                await sendHTMLEmail(createdEmail.toJSON());
                
                // Actualizar el estado en la base de datos a 'sent' después del envío exitoso
                createdEmail.status = 'sent';
                createdEmail.sentAt = new Date();
                await createdEmail.save();

                results.push({ email: emailData.to, status: 'success' });
            } catch (error) {
                console.error(`Error sending email to ${emailData.to}:`, error);
                errors.push({ email: emailData.to, error: error.message });
                
                // Opcional: actualizar el estado del correo a 'failed' en la base de datos
                // Si createdEmail está definido:
                if (createdEmail && createdEmail.status !== 'sent') {
                    // Asegurarse de que no se marque como failed si ya se marcó como sent
                    createdEmail.status = 'failed';
                    await createdEmail.save().catch(dbError => console.error('Error updating email status to failed:', dbError));
                }
            }
        }

        // Clear queue after sending
        emailQueue = [];

        res.json({
            success: true,
            message: `Sent ${results.length} emails, ${errors.length} failed`,
            results,
            errors
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error processing email queue',
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
        // Asegurarse de que emailData tenga un ID para el tracking
        const emailId = emailData.id; // Asumimos que emailData ya tiene un ID asignado desde la base de datos

        if (!emailId) {
            console.error('Error: emailData does not have an ID for tracking.', emailData);
            // Decide how to handle this case: throw an error, skip tracking, etc.
            // For now, we'll throw an error to prevent sending untracked emails.
            throw new Error('Cannot send email without a valid ID for tracking.');
        }

        // Obtener la función generateTrackingLink del servicio EmailTrackingService
        const { generateTrackingLink } = require('./services/emailTracking');

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
                productImage: emailData.productImage,
                // Pasar la función generateTrackingLink y la URL del pixel a la plantilla
                trackingLink: (link) => generateTrackingLink(emailId, link),
                trackingPixel: generateTrackingLink(emailId) // URL para el pixel de apertura
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
        
        // Generar ID de campaña si no se proporciona (para envíos manuales)
        const campaignId = `manual_${Date.now()}`;

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
            productImage: imageUrl, // Use the ImgBB URL instead of local path
            campaignId: campaignId // Capturar y asignar campaignId
        };

        // *** Guardar el correo en la base de datos antes de enviar ***
        const { Email } = require('./models/Email');
        const createdEmail = await Email.create(emailData);
        
        // Usar el objeto de correo creado (con ID) para enviar el email
        const result = await sendHTMLEmail(createdEmail.toJSON());
        
        // Actualizar el estado en la base de datos a 'sent' después del envío exitoso
        createdEmail.status = 'sent';
        createdEmail.sentAt = new Date();
        await createdEmail.save();

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
            productImage: imageUrl,  // Use ImgBB URL instead of local path
            campaignId: req.body.campaignId || 'preview' // Usar campaignId del formulario o 'preview'
        };

        // Obtener la función generateTrackingLink para la vista previa
        const { generateTrackingLink } = require('./services/emailTracking');
        const dummyEmailId = 'preview-id'; // Usar un ID ficticio para la vista previa

        const htmlContent = await ejs.renderFile(
            path.join(__dirname, '../views/email-template.ejs'),
            {
                ...emailData,
                // Pasar la función generateTrackingLink y la URL del pixel a la plantilla
                trackingLink: (link) => generateTrackingLink(dummyEmailId, link),
                trackingPixel: generateTrackingLink(dummyEmailId) // URL para el pixel de apertura con ID ficticio
            }
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

// Add this with your other routes
app.delete('/queue', (req, res) => {
    try {
        emailQueue = [];
        res.json({ success: true, message: 'Queue cleared successfully' });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error clearing queue',
            error: error.message 
        });
    }
});

// Existing delete single item route
app.delete('/queue/:index', (req, res) => {
    try {
        const index = parseInt(req.params.index);
        if (index >= 0 && index < emailQueue.length) {
            emailQueue.splice(index, 1);
            res.json({ success: true, message: 'Email removed from queue' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid index' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error removing email from queue' });
    }
});

// Nuevas rutas para seguimiento
app.get('/track/open/:emailId', async (req, res) => {
    try {
        const success = await EmailTrackingService.trackOpen(req.params.emailId);
        if (success) {
            // Enviar un pixel de seguimiento transparente
            res.writeHead(200, { 'Content-Type': 'image/gif' });
            res.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
        } else {
            res.status(500).send('Error tracking email open');
        }
    } catch (error) {
        res.status(500).send('Error tracking email open');
    }
});

app.get('/track/click/:emailId', async (req, res) => {
    try {
        const { link } = req.query;
        const success = await EmailTrackingService.trackClick(req.params.emailId, link);
        if (success) {
            res.redirect(link);
        } else {
            res.status(500).send('Error tracking click');
        }
    } catch (error) {
        res.status(500).send('Error tracking click');
    }
});

// Rutas para programación de correos
app.post('/schedule-email', async (req, res) => {
    try {
        const { emailData, scheduledFor } = req.body;
        const scheduledEmail = await EmailScheduler.scheduleEmail(emailData, scheduledFor);
        res.json({ success: true, email: scheduledEmail });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/scheduled-emails', async (req, res) => {
    try {
        const scheduledEmails = await EmailScheduler.getScheduledEmails();
        res.json({ success: true, emails: scheduledEmails });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/scheduled-email/:emailId', async (req, res) => {
    try {
        const success = await EmailScheduler.cancelScheduledEmail(req.params.emailId);
        res.json({ success });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Ruta para estadísticas
app.get('/stats/:campaignId', async (req, res) => {
    try {
        const stats = await EmailTrackingService.getEmailStats(req.params.campaignId);
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Ruta del dashboard
app.get('/dashboard', async (req, res) => {
    try {
        // Obtener estadísticas generales
        const stats = await EmailTrackingService.getEmailStats();

        // Obtener correos programados
        const scheduledEmails = await EmailScheduler.getScheduledEmails();

        // Obtener datos de actividad por día (últimos 7 días)
        const activityData = await EmailTrackingService.getActivityData();

        res.render('dashboard', {
            stats,
            scheduledEmails,
            activityData
        });
    } catch (error) {
        console.error('Error al cargar el dashboard:', error);
        res.status(500).send('Error al cargar el dashboard');
    }
});