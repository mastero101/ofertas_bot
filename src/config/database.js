const { Sequelize } = require('sequelize');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL no está definida en el archivo .env');
    process.exit(1);
}

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    },
    logging: false,
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
});

const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('Conexión a PostgreSQL establecida correctamente.');
        
        // Sincronizar modelos con la base de datos
        await sequelize.sync({ alter: true });
        console.log('Modelos sincronizados con la base de datos.');
        
        // Verificar que las tablas principales existen
        const tables = await sequelize.getQueryInterface().showAllTables();
        console.log('Tablas disponibles:', tables);
        
        if (!tables.includes('Emails')) {
            console.warn('⚠️  Tabla Emails no encontrada');
        }
        if (!tables.includes('Campaigns')) {
            console.warn('⚠️  Tabla Campaigns no encontrada');
        }
        if (!tables.includes('EmailClicks')) {
            console.warn('⚠️  Tabla EmailClicks no encontrada - se creará automáticamente');
        }
        
    } catch (error) {
        console.error('Error al conectar con la base de datos:', error);
        process.exit(1);
    }
};

module.exports = { sequelize, connectDB }; 