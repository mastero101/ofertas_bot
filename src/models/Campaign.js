const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Campaign = sequelize.define('Campaign', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('active', 'paused', 'completed'),
        defaultValue: 'active'
    },
    scheduledFor: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Fecha y hora programada para el envío de la campaña'
    },
    totalEmails: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    sentEmails: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    openedEmails: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    clickedEmails: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    failedEmails: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    timestamps: true,
    tableName: 'Campaigns'
});

module.exports = Campaign; 