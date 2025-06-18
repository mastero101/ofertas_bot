const { Email } = require('../models');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const { Campaign } = require('../models');

async function insertTestScheduledEmail() {
    const now = new Date();
    const scheduledFor = new Date(now.getTime() + 1 * 60 * 1000); // 1 minuto en el futuro
    let campaignId;
    try {
        await sequelize.authenticate();
        // Crear campaña de prueba
        const campaign = await Campaign.create({
            id: uuidv4(),
            name: 'Campaña de Prueba Programada',
            description: 'Campaña generada automáticamente para pruebas de envío programado',
            status: 'active'
        });
        campaignId = campaign.id;
        // Crear correo programado
        const email = await Email.create({
            id: uuidv4(),
            to: 'prueba@correo.com',
            subject: 'Correo programado de prueba',
            status: 'scheduled',
            scheduledFor,
            customerName: 'Cliente Prueba',
            offerTitle: 'Oferta de Prueba',
            offerDescription: 'Esta es una oferta de prueba para el sistema programado.',
            offerPrice: 99.99,
            offerLink: 'https://ejemplo.com',
            productImage: null,
            campaignId,
            unsubscribeLink: '#'
        });
        console.log('✅ Correo programado de prueba insertado:', email.id, 'Programado para:', scheduledFor);
    } catch (error) {
        console.error('❌ Error al insertar correo programado de prueba:', error.message);
    } finally {
        await sequelize.close();
    }
}

async function checkScheduledEmails() {
    try {
        console.log('🔍 Verificando correos programados...');
        
        // Verificar conexión
        await sequelize.authenticate();
        console.log('✅ Conexión a la base de datos exitosa');
        
        // Buscar correos programados
        const scheduledEmails = await Email.findAll({
            where: {
                status: 'scheduled'
            },
            order: [['scheduledFor', 'ASC']]
        });
        
        console.log(`📧 Encontrados ${scheduledEmails.length} correos programados:`);
        
        if (scheduledEmails.length > 0) {
            scheduledEmails.forEach((email, index) => {
                console.log(`${index + 1}. ID: ${email.id}`);
                console.log(`   Para: ${email.to}`);
                console.log(`   Asunto: ${email.subject}`);
                console.log(`   Programado para: ${email.scheduledFor}`);
                console.log(`   Estado: ${email.status}`);
                console.log(`   Creado: ${email.createdAt}`);
                console.log('---');
            });
        }
        
        // Verificar correos que deberían haberse enviado ya
        const overdueEmails = await Email.findAll({
            where: {
                status: 'scheduled',
                scheduledFor: {
                    [Op.lte]: new Date()
                }
            }
        });
        
        console.log(`⏰ Encontrados ${overdueEmails.length} correos que deberían haberse enviado ya:`);
        
        if (overdueEmails.length > 0) {
            overdueEmails.forEach((email, index) => {
                console.log(`${index + 1}. ID: ${email.id}`);
                console.log(`   Para: ${email.to}`);
                console.log(`   Programado para: ${email.scheduledFor}`);
                console.log(`   Debería haberse enviado hace: ${Math.floor((new Date() - new Date(email.scheduledFor)) / 1000 / 60)} minutos`);
                console.log('---');
            });
        }
        
    } catch (error) {
        console.error('❌ Error al verificar correos programados:', error.message);
    } finally {
        await sequelize.close();
        console.log('🔌 Conexión cerrada');
    }
}

// Ejecutar solo la inserción de prueba si se pasa el argumento 'insert'
if (process.argv.includes('insert')) {
    insertTestScheduledEmail();
} else {
    checkScheduledEmails();
} 