const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const xlsx = require('xlsx');
const path = require('path');
const ejs = require('ejs');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
});
const upload = multer({ storage: storage });

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

app.post('/upload', upload.single('excelFile'), (req, res) => {
    // Handle Excel file upload
    // TODO: Implement Excel processing
    res.json({ message: 'File uploaded successfully' });
});

// Add email configuration
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',  // Replace with your SMTP server
    port: 587,
    secure: false,
    auth: {
        user: 'your-email@gmail.com',  // Replace with your email
        pass: 'your-password'          // Replace with your password/app password
    }
});

// Add new function to send HTML email
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
                unsubscribeLink: emailData.unsubscribeLink
            }
        );

        const mailOptions = {
            from: '"Your Company" <your-email@gmail.com>',
            to: emailData.to,
            subject: emailData.subject,
            html: htmlContent
        };

        return await transporter.sendMail(mailOptions);
    } catch (error) {
        throw error;
    }
}

// Modify the send-emails route
app.post('/send-emails', async (req, res) => {
    try {
        const emailData = {
            to: req.body.email,
            subject: req.body.subject,
            companyName: 'Your Company Name',
            customerName: req.body.customerName || 'Valued Customer',
            offerTitle: req.body.offerTitle,
            offerDescription: req.body.offerDescription,
            offerPrice: req.body.offerPrice,
            offerLink: req.body.offerLink || '#',
            unsubscribeLink: '#'
        };

        await sendHTMLEmail(emailData);
        res.json({ success: true, message: 'Email sent successfully' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ success: false, message: 'Error sending email' });
    }
});

// Add preview route
// Add this near the top with other middleware
app.use('/uploads', express.static('uploads'));

// Update the preview route to handle file uploads
app.post('/preview-email', upload.single('productImage'), async (req, res) => {
    try {
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
            productImage: req.file ? `/uploads/${req.file.filename}` : null
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

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});