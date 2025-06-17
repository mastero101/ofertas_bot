const { sequelize } = require('../config/database');
const { EmailClick } = require('../models');

async function syncEmailClicks() {
    try {
        console.log('Sincronizando tabla EmailClicks...');
        
        // Forzar la sincronización de la tabla EmailClicks
        await EmailClick.sync({ force: false, alter: true });
        
        console.log('Tabla EmailClicks sincronizada correctamente.');
        
        // Verificar que la tabla existe
        const tableExists = await sequelize.getQueryInterface().showAllTables();
        console.log('Tablas existentes:', tableExists);
        
        if (tableExists.includes('EmailClicks')) {
            console.log('✅ Tabla EmailClicks existe en la base de datos');
        } else {
            console.log('❌ Tabla EmailClicks NO existe en la base de datos');
        }
        
    } catch (error) {
        console.error('Error al sincronizar EmailClicks:', error);
    } finally {
        await sequelize.close();
    }
}

syncEmailClicks(); 