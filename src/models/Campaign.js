const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { Email } = require('./Email');

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
        type: DataTypes.TEXT
    },
    status: {
        type: DataTypes.ENUM('draft', 'scheduled', 'active', 'completed', 'paused'),
        defaultValue: 'draft'
    },
    scheduledStart: {
        type: DataTypes.DATE
    },
    scheduledEnd: {
        type: DataTypes.DATE
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

// Establecer la relación entre Campaign y Email
Campaign.hasMany(Email, { foreignKey: 'campaignId' });
Email.belongsTo(Campaign, { foreignKey: 'campaignId' });

module.exports = Campaign; 