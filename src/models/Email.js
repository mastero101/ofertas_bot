const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Email = sequelize.define('Email', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    to: {
        type: DataTypes.STRING,
        allowNull: false
    },
    customerName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    subject: {
        type: DataTypes.STRING,
        allowNull: false
    },
    offerTitle: {
        type: DataTypes.STRING,
        allowNull: false
    },
    offerDescription: {
        type: DataTypes.TEXT
    },
    offerPrice: {
        type: DataTypes.DECIMAL(10, 2)
    },
    offerLink: {
        type: DataTypes.STRING
    },
    productImage: {
        type: DataTypes.STRING
    },
    status: {
        type: DataTypes.ENUM('pending', 'scheduled', 'sent', 'failed'),
        defaultValue: 'pending'
    },
    scheduledFor: {
        type: DataTypes.DATE
    },
    sentAt: {
        type: DataTypes.DATE
    },
    trackingOpened: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    trackingOpenedAt: {
        type: DataTypes.DATE
    },
    campaignId: {
        type: DataTypes.STRING
    },
    templateId: {
        type: DataTypes.STRING
    }
}, {
    timestamps: true
});

// Modelo para el seguimiento de clics
const EmailClick = sequelize.define('EmailClick', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    emailId: {
        type: DataTypes.UUID,
        references: {
            model: Email,
            key: 'id'
        }
    },
    link: {
        type: DataTypes.STRING,
        allowNull: false
    },
    clickedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

// Establecer la relación entre Email y EmailClick
Email.hasMany(EmailClick);
EmailClick.belongsTo(Email);

module.exports = { Email, EmailClick }; 