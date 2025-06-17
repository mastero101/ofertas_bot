const { sequelize } = require('../config/database');

async function checkDatabase() {
    try {
        console.log('🔍 Verificando estado de la base de datos...');
        
        // Verificar conexión
        await sequelize.authenticate();
        console.log('✅ Conexión a la base de datos exitosa');
        
        // Listar todas las tablas
        const tables = await sequelize.getQueryInterface().showAllTables();
        console.log('📋 Tablas disponibles:', tables);
        
        // Verificar tablas específicas
        const requiredTables = ['Emails', 'Campaigns', 'EmailClicks'];
        for (const table of requiredTables) {
            if (tables.includes(table)) {
                console.log(`✅ Tabla ${table} existe`);
            } else {
                console.log(`❌ Tabla ${table} NO existe`);
            }
        }
        
        // Intentar sincronizar si faltan tablas
        if (!tables.includes('EmailClicks')) {
            console.log('🔄 Intentando crear tabla EmailClicks...');
            const { EmailClick } = require('../models');
            await EmailClick.sync({ force: false });
            console.log('✅ Tabla EmailClicks creada/actualizada');
        }
        
    } catch (error) {
        console.error('❌ Error al verificar la base de datos:', error.message);
    } finally {
        await sequelize.close();
        console.log('🔌 Conexión cerrada');
    }
}

checkDatabase(); 