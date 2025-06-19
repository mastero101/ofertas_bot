const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

async function uploadImageToCloudinary(buffer, filename = 'image') {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'correos',
        public_id: filename.split('.')[0],
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

// Alternativa usando filePath (por si se requiere en algún flujo)
async function uploadImageFilePathToCloudinary(filePath) {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'correos'
    });
    return result.secure_url;
  } catch (error) {
    throw error;
  }
}

module.exports = { uploadImageToCloudinary, uploadImageFilePathToCloudinary }; 