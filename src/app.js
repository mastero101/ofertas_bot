const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const ejs = require('ejs');
const imgbbUploader = require('imgbb-uploader');
const { connectDB } = require('./config/database');
const EmailScheduler = require('./services/emailScheduler');
const EmailTrackingService = require('./services/emailTracking');
const statisticsRoutes = require('./routes/statistics');
const errorHandler = require('./middleware/errorHandler');
const { v4: uuidv4 } = require('uuid');
const { Campaign, Email } = require('./models');
const campaignsRoutes = require('./routes/campaigns');
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

        // Generar ID de campaña usando UUID
        const campaignId = uuidv4();

        // Crear la campaña primero
        await Campaign.create({
            id: campaignId,
            name: `Campaña ${new Date().toLocaleDateString()}`,
            description: req.body.subject,
            status: 'active'
        });

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

        // Validar y formatear el offerLink
        let offerLink = req.body.offerLink || '#';
        if (offerLink !== '#' && !offerLink.startsWith('http://') && !offerLink.startsWith('https://')) {
            offerLink = `https://${offerLink}`;
        }

        // Store data in queue with common email content
        emailQueue = data.map(row => ({
            to: row.email,
            customerName: row.customerName || 'Cliente',
            subject: req.body.subject.trim(),
            companyName: 'HAMSE',
            offerTitle: req.body.offerTitle,
            offerDescription: req.body.offerDescription,
            offerPrice: req.body.offerPrice,
            offerLink: offerLink,
            unsubscribeLink: '#',
            productImage: imageUrl,
            campaignId: campaignId
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

// Handle manual email submission
app.post('/send-emails', upload.single('productImage'), async (req, res) => {
    try {
        const { email, customerName, subject, offerTitle, offerDescription, offerPrice, offerLink, scheduledFor, scheduleEmail, campaignId } = req.body;

        // Handle product image upload if present
        let imageUrl = null;
        if (req.file) {
            const imgbbResponse = await imgbbUploader({
                apiKey: process.env.IMGBB_API_KEY,
                base64string: req.file.buffer.toString('base64')
            });
            imageUrl = imgbbResponse.display_url;
        }

        // Validar y formatear el offerLink
        let formattedOfferLink = offerLink || '#';
        if (formattedOfferLink !== '#' && !formattedOfferLink.startsWith('http://') && !formattedOfferLink.startsWith('https://')) {
            formattedOfferLink = `https://${formattedOfferLink}`;
        }

        // Generar ID de campaña si no se proporciona
        const finalCampaignId = campaignId || uuidv4();

        // Crear o encontrar la campaña
        let campaign = await Campaign.findByPk(finalCampaignId);
        if (!campaign) {
            campaign = await Campaign.create({
                id: finalCampaignId,
                name: `Campaña Manual ${new Date().toLocaleDateString()}`,
                description: subject,
                status: 'active'
            });
        }

        const emailData = {
            to: email,
            customerName: customerName || 'Cliente',
            subject: subject.trim(),
            companyName: 'HAMSE',
            offerTitle: offerTitle,
            offerDescription: offerDescription,
            offerPrice: offerPrice,
            offerLink: formattedOfferLink,
            unsubscribeLink: '#',
            productImage: imageUrl,
            campaignId: finalCampaignId,
            status: scheduleEmail === 'on' ? 'scheduled' : 'pending',
            scheduledFor: scheduleEmail === 'on' ? new Date(scheduledFor) : null
        };

        // Guardar el correo en la base de datos
        const createdEmail = await Email.create(emailData);

        if (scheduleEmail === 'on') {
            // Si está programado, el scheduler lo manejará
            res.json({ success: true, message: 'Correo programado exitosamente.' });
        } else {
            // Enviar el correo inmediatamente
            await sendHTMLEmail(createdEmail.toJSON());
            createdEmail.status = 'sent';
            createdEmail.sentAt = new Date();
            await createdEmail.save();
            res.json({ success: true, message: 'Correo enviado satisfactoriamente.' });
        }
    } catch (error) {
        console.error('Error sending manual email:', error);
        res.status(500).json({ success: false, message: 'Error al enviar el correo', error: error.message });
    }
});

// Add this near the top with other middleware
app.use('/uploads', express.static('uploads'));

// Preview email route
app.post('/preview-email', upload.single('productImage'), async (req, res) => {
    try {
        const { subject, offerTitle, offerDescription, offerPrice, offerLink, customerName } = req.body;
        
        let imageUrl = null;
        if (req.file) {
            const imgbbResponse = await imgbbUploader({
                apiKey: process.env.IMGBB_API_KEY,
                base64string: req.file.buffer.toString('base64')
            });
            imageUrl = imgbbResponse.display_url;
        }

        // Obtener la función generateTrackingLink para la vista previa
        const { generateTrackingLink } = require('./services/emailTracking');
        const dummyEmailId = 'preview-id'; // Usar un ID ficticio para la vista previa

        // Renderizar la plantilla EJS con los datos proporcionados
        ejs.renderFile(path.join(__dirname, '..', 'views', 'email-template.ejs'), {
            subject,
            customerName: customerName || 'Cliente',
            offerTitle,
            offerDescription,
            offerPrice,
            offerLink: offerLink || '#',
            productImage: imageUrl,
            unsubscribeLink: '#',
            companyName: 'HAMSE',
            // Pasar la función generateTrackingLink y la URL del pixel a la plantilla
            trackingLink: (link) => generateTrackingLink(dummyEmailId, link),
            trackingPixel: generateTrackingLink(dummyEmailId) // URL para el pixel de apertura con ID ficticio
        }, (err, html) => {
            if (err) {
                console.error('Error rendering email template:', err);
                return res.status(500).json({ success: false, message: 'Error al renderizar la plantilla de correo', error: err.message });
            }
            res.send(html); // Enviar el HTML renderizado al cliente
        });

    } catch (error) {
        console.error('Error in preview-email route:', error);
        res.status(500).json({ success: false, message: 'Error al generar la vista previa del correo', error: error.message });
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
        await EmailTrackingService.trackOpen(req.params.emailId);
        // Enviar una imagen de 1x1 píxel para el seguimiento
        res.sendFile(path.join(__dirname, '../public/images/tracking_pixel.png'));
    } catch (error) {
        console.error('Error recording email open:', error);
        res.status(500).send('Error de seguimiento');
    }
});

app.get('/track/click/:emailId', async (req, res) => {
    try {
        const { link } = req.query;
        if (!link) {
            return res.status(400).send('Enlace no proporcionado');
        }
        await EmailTrackingService.trackClick(req.params.emailId, decodeURIComponent(link));
        res.redirect(decodeURIComponent(link)); // Redirigir al usuario al enlace original
    } catch (error) {
        console.error('Error recording email click:', error);
        res.status(500).send('Error de seguimiento de clics');
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

// Rutas principales
app.get('/dashboard', async (req, res) => {
    try {
        const StatisticsService = require('./services/statisticsService');
        const generalStats = await StatisticsService.getGeneralStats();
        const dailyStats = await StatisticsService.getDailyStats();
        const scheduledEmails = await StatisticsService.getScheduledEmails();
        
        res.render('dashboard', {
            stats: generalStats,
            dailyStats: dailyStats,
            scheduledEmails: scheduledEmails
        });
    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.status(500).render('error', { message: 'Error al cargar el dashboard' });
    }
});

// Rutas de estadísticas
app.use('/api/statistics', statisticsRoutes);

// Rutas de campañas
app.use('/api/campaigns', campaignsRoutes);
app.get('/campaigns', (req, res) => {
    res.redirect('/api/campaigns');
});

// Middleware de manejo de errores (debe ir después de todas las rutas)
app.use(errorHandler);

app.post('/send-mass-emails', upload.fields([
    { name: 'excelFile', maxCount: 1 },
    { name: 'productImage', maxCount: 1 }
]), async (req, res) => {
    try {
        if (!req.files || !req.files.excelFile) {
            return res.status(400).json({ success: false, message: 'No se proporcionó el archivo Excel' });
        }

        let imageUrl = null;
        if (req.files.productImage) {
            const imgbbResponse = await imgbbUploader({
                apiKey: IMGBB_API_KEY,
                base64string: req.files.productImage[0].buffer.toString('base64')
            });
            imageUrl = imgbbResponse.display_url;
        }

        // Generar ID de campaña usando UUID
        const campaignId = uuidv4();

        console.log('scheduledFor from request (mass):', req.body.scheduledFor);

        // Crear la campaña
        await Campaign.create({
            id: campaignId,
            name: `Campaña Masiva ${new Date().toLocaleDateString()}`,
            description: req.body.subject,
            status: req.body.scheduledFor ? 'paused' : 'active',
            scheduledFor: req.body.scheduledFor ? new Date(req.body.scheduledFor) : null
        });

        // Leer el archivo Excel
        const workbook = xlsx.read(req.files.excelFile[0].buffer);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);

        // Validar y formatear el offerLink
        let offerLink = req.body.offerLink || '#';
        if (offerLink !== '#' && !offerLink.startsWith('http://') && !offerLink.startsWith('https://')) {
            offerLink = `https://${offerLink}`;
        }

        const results = [];
        const errors = [];

        // Procesar cada correo
        for (const row of data) {
            try {
                const emailData = {
                    to: row.email,
                    subject: req.body.subject,
                    companyName: 'HAMSE',
                    customerName: row.name || 'Cliente',
                    offerTitle: req.body.offerTitle,
                    offerDescription: req.body.offerDescription,
                    offerPrice: req.body.offerPrice,
                    offerLink: offerLink,
                    unsubscribeLink: '#',
                    productImage: imageUrl,
                    campaignId: campaignId
                };

                // Si hay fecha programada, agregarla
                if (req.body.scheduledFor) {
                    emailData.scheduledFor = new Date(req.body.scheduledFor);
                }

                // Crear el correo en la base de datos
                const createdEmail = await Email.create(emailData);
                
                console.log('Created Email object for mass email before sending/scheduling:', createdEmail.toJSON());

                // Enviar el correo (o programarlo si tiene fecha programada)
                await sendHTMLEmail(createdEmail.toJSON());

                results.push({ email: row.email, status: 'success' });
            } catch (error) {
                console.error(`Error processing email ${row.email}:`, error);
                errors.push({ email: row.email, error: error.message });
            }
        }

        res.json({
            success: true,
            message: req.body.scheduledFor ? 
                'Correos programados exitosamente' : 
                'Correos enviados satisfactoriamente',
            results,
            errors
        });
    } catch (error) {
        console.error('Error processing mass emails:', error);
        res.status(500).json({
            success: false,
            message: 'Error al procesar los correos',
            error: error.message
        });
    }
});