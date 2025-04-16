const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
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
            // Upload to ImgBB with correct parameter
            const imgbbResponse = await imgbbUploader({
                apiKey: IMGBB_API_KEY,
                imagePath: path.join(__dirname, '..', 'uploads', req.file.filename) // Changed from 'path' to 'imagePath'
            });
            imageUrl = imgbbResponse.display_url; // Use display_url for direct image link
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

// Add preview route
// Add this near the top with other middleware
app.use('/uploads', express.static('uploads'));

// Update the preview route to handle file uploads
app.post('/preview-email', upload.single('productImage'), async (req, res) => {
    try {
        let imageUrl = null;
        if (req.file) {
            const imgbbResponse = await imgbbUploader({
                apiKey: IMGBB_API_KEY,
                imagePath: path.join(__dirname, '..', 'uploads', req.file.filename)
            });
            imageUrl = imgbbResponse.display_url; // Use ImgBB URL for preview
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

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});