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
    customerName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    subject: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            notEmpty: true
        }
    },
    offerTitle: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            notEmpty: true
        }
    },
    offerDescription: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    offerPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        validate: {
            isDecimal: true
        }
    },
    offerLink: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
            isUrl: true
        }
    },
    productImage: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
            isUrl: true
        }
    },
    status: {
        type: DataTypes.ENUM('pending', 'scheduled', 'sent', 'failed'),
        defaultValue: 'pending'
    },
    scheduledFor: {
        type: DataTypes.DATE,
        allowNull: true
    },
    sentAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    trackingOpened: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    trackingOpenedAt: {
        type: DataTypes.DATE,
        allowNull: true
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