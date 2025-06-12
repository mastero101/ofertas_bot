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
        allowNull: false,
        validate: {
            isEmail: true
        }
    },
    subject: {
        type: DataTypes.STRING,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('pending', 'sent', 'failed', 'scheduled'),
        defaultValue: 'pending'
    },
    sentAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    scheduledFor: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Fecha y hora programada para el envío'
    },
    customerName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    offerTitle: {
        type: DataTypes.STRING,
        allowNull: false
    },
    offerDescription: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    offerPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
    },
    offerLink: {
        type: DataTypes.STRING,
        allowNull: true
    },
    productImage: {
        type: DataTypes.STRING,
        allowNull: true
    },
    trackingOpened: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    campaignId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'Campaigns',
            key: 'id'
        },
        validate: {
            isUUID: 4
        }
    },
    templateId: {
        type: DataTypes.UUID,
        allowNull: true,
        validate: {
            isUUID: 4
        }
    },
    zeptoRequestId: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'ID de solicitud de ZeptoMail para seguimiento'
    },
    errorDetails: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Detalles del error si el envío falla'
    }
}, {
    timestamps: true,
    tableName: 'Emails'
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