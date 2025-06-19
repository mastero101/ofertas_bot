# Email Offer Sending System

A Node.js application for sending promotional offers via email to multiple recipients. The system supports both individual and bulk email sending with customizable templates.

## Features

- 📧 Single email sending
- 📨 Bulk email sending via Excel files
- 📝 Customizable email templates
- 🖼️ Image upload support
- 📋 Email queue management
- 👀 Email preview functionality

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)

## Installation

1. Clone the repository:

```bash
git clone https://github.com/mastero101/ofertas_bot.git
```  

2. Install dependencies:

```bash
npm install
 ```

3. Create a .env file in the root directory with the following variables:

```bash
ZEPTO_API_KEY=your_zepto_api_key
ZEPTO_FROM_EMAIL=noreply@ferche.app
FROM_EMAIL=noreply@ferche.app
BOUNCE_EMAIL=reply@ferche.app
BASE_URL=http://localhost:1071
CLOUDINARY_CLOUD_NAME=cloud_name
CLOUDINARY_API_KEY=api_key
CLOUDINARY_API_SECRET=api_secret
DATABASE_URL=postgresql_url
 ```

## Usage
Start the application:

```bash
node src/app.js
 ```

The application will be available at http://localhost:1071

## Features Guide
### Single Email Sending
- Fill in the recipient details and offer information
- Upload an optional product image
- Preview the email before sending
- Send to a single recipient
### Bulk Email Sending
1. Download the email template Excel file
2. Fill in the recipient information
3. Upload the completed Excel file
4. Add offer details and optional image
5. Send to multiple recipients
## Dependencies
- Express.js - Web framework
- Multer - File upload handling
- XLSX - Excel file processing
- EJS - Template engine
- imgbb-uploader - Image hosting
- node-fetch - HTTP client
## Environment Variables
- ZEPTO_API_KEY : API key for Zepto email service
- ZEPTO_FROM_EMAIL : Sender email address
- IMGBB_API_KEY : API key for ImgBB image hosting

